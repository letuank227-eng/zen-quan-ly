import { Request, Response } from 'express';
import prisma from '../prisma/client';
import { verifyMetaSignature, decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { emitToAccount, emitToPage, emitToUser } from '../services/socketService';
import { MetaGraphService } from '../services/metaGraphService';

export class WebhookController {
  /**
   * Meta Webhook Verification (GET)
   */
  static verifyWebhook(req: Request, res: Response) {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'zen_crm_verify_token_secure_2026';

      if (mode === 'subscribe' && token === expectedToken) {
        logger.info('Meta Webhook verified successfully.');
        return res.status(200).send(challenge);
      } else {
        logger.warn('Meta Webhook verification failed. Invalid token.');
        return res.sendStatus(403);
      }
    } catch (error: any) {
      logger.error('Webhook verification error:', error.message);
      return res.sendStatus(500);
    }
  }

  /**
   * Meta Webhook Event Handler (POST)
   */
  static async handleWebhookEvent(req: Request, res: Response) {
    // 1. Immediately acknowledge 200 OK to Meta
    res.status(200).send('EVENT_RECEIVED');

    // 2. Validate signature if META_APP_SECRET is set
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const appSecret = process.env.META_APP_SECRET;

    if (appSecret && signature) {
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const isValid = verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        logger.warn('Meta Webhook invalid signature. Event rejected.');
        return;
      }
    }

    const body = req.body;
    if (body.object !== 'page') {
      return;
    }

    // 3. Process entries asynchronously
    try {
      for (const entry of body.entry || []) {
        const metaPageId = entry.id;

        // Save raw event for audit & debugging
        const webhookEvent = await prisma.webhookEvent.create({
          data: {
            eventType: entry.messaging ? 'MESSENGER' : (entry.changes ? 'FEED_CHANGE' : 'OTHER'),
            pageId: metaPageId,
            payload: JSON.stringify(entry),
            processed: false,
          },
        });

        // Find connected page in DB
        const page = await prisma.page.findFirst({
          where: { metaPageId, isConnected: true },
          include: { account: true },
        });

        if (!page) {
          logger.warn(`Webhook received for unmanaged or disconnected page: ${metaPageId}`);
          continue;
        }

        // A. Handle Messenger Events concurrently (both direct messaging and standby from Handover Protocol)
        const messagingEvents = entry.messaging || entry.standby || [];
        if (Array.isArray(messagingEvents) && messagingEvents.length > 0) {
          await Promise.all(messagingEvents.map((msgEvent: any) => handleMessagingEvent(page, msgEvent)));
        }

        // B. Handle Feed / Comment Events
        if (Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.field === 'feed') {
              await handleFeedChangeEvent(page, change.value);
            }
          }
        }

        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { processed: true },
        });
      }
    } catch (err: any) {
      logger.error('Error processing webhook async event:', err.message);
    }
  }
}

// In-memory set to prevent redundant profile fetch attempts for unknown/restricted PSIDs
const profileAttempts = new Set<string>();

/**
 * Handle incoming Messenger messages
 */
async function handleMessagingEvent(page: any, event: any) {
  try {
    const senderPsid = event.sender?.id;
    const recipientId = event.recipient?.id;
    const isEcho = Boolean(event.message?.is_echo || senderPsid === page.metaPageId);

    const messageObj = event.message;
    if (!messageObj) return;

    const metaMid = messageObj.mid;
    const hasAttachments = messageObj.attachments && messageObj.attachments.length > 0;
    const messageText = messageObj.text || (hasAttachments ? '[Hình ảnh]' : '');

    // Deduplication check
    if (metaMid) {
      const existingMsg = await prisma.message.findUnique({
        where: { metaMessageId: metaMid },
      });
      if (existingMsg) return;
    }

    const customerPsid = isEcho ? recipientId : senderPsid;
    if (!customerPsid) return;

    // Fast memory or DB customer lookup (<2ms)
    let customer = await prisma.customer.findFirst({
      where: { accountId: page.accountId, metaId: customerPsid },
    });

    let customerName = customer?.name || `Khách hàng #${customerPsid.slice(-4)}`;
    let customerAvatar: string | null = customer?.avatar || null;

    // 1. Instant Customer upsert (<5ms)
    customer = await prisma.customer.upsert({
      where: {
        accountId_metaId: {
          accountId: page.accountId,
          metaId: customerPsid,
        },
      },
      update: {
        lastInteractionAt: new Date(),
      },
      create: {
        accountId: page.accountId,
        primaryPageId: page.id,
        metaId: customerPsid,
        name: customerName,
        avatar: customerAvatar,
        status: 'NEW',
        lastInteractionAt: new Date(),
      },
    });

    // 2. Instant Conversation upsert (<5ms)
    const conversation = await prisma.conversation.upsert({
      where: {
        pageId_customerId: {
          pageId: page.id,
          customerId: customer.id,
        },
      },
      update: {
        snippet: messageText,
        unreadCount: isEcho ? undefined : { increment: 1 },
        lastMessageAt: new Date(),
        status: isEcho ? undefined : 'PENDING',
      },
      create: {
        pageId: page.id,
        customerId: customer.id,
        snippet: messageText,
        unreadCount: isEcho ? 0 : 1,
        status: isEcho ? 'PROCESSING' : 'PENDING',
        lastMessageAt: new Date(),
      },
    });

    // 3. Instant Message create (<5ms)
    const savedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        pageId: page.id,
        metaMessageId: metaMid,
        senderType: isEcho ? 'PAGE' : 'CUSTOMER',
        senderId: isEcho ? page.metaPageId : customerPsid,
        senderName: isEcho ? page.name : customer.name,
        text: messageText,
        attachments: messageObj.attachments ? JSON.stringify(messageObj.attachments) : null,
        isRead: isEcho,
        sentStatus: isEcho ? 'SENT' : 'DELIVERED',
      },
    });

    // 4. INSTANT REALTIME BROADCAST VIA SOCKET.IO (0ms network delay!)
    const msgPayload = {
      conversationId: conversation.id,
      pageId: page.id,
      page: { id: page.id, name: page.name, avatar: page.avatar },
      message: savedMessage,
      customer,
    };
    emitToPage(page.id, isEcho ? 'message_sent' : 'new_message', msgPayload);
    emitToAccount(page.accountId, isEcho ? 'message_sent' : 'new_message', msgPayload);

    emitToAccount(page.accountId, 'conversation_updated', {
      id: conversation.id,
      snippet: messageText,
      unreadCount: conversation.unreadCount,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
    });

    // 5. Asynchronous background tasks (fire-and-forget: does NOT block message delivery)
    // A. Notification
    if (!isEcho) {
      (async () => {
        try {
          const adminUser = await prisma.user.findFirst({
            where: { accountId: page.accountId, role: 'ADMIN' },
          });
          if (adminUser) {
            const notif = await prisma.notification.create({
              data: {
                userId: conversation.assignedUserId || adminUser.id,
                title: `Tin nhắn mới từ ${customer.name}`,
                message: messageText.slice(0, 100),
                type: 'MESSENGER',
                pageId: page.id,
                referenceId: conversation.id,
              },
            });
            if (notif.userId) emitToUser(notif.userId, 'notification', notif);
          }
        } catch {}
      })();
    }

    // B. Background Profile Enrichment (if missing name/avatar, fetch in background without delaying chat)
    if ((!customer.avatar || customer.name.startsWith('Khách hàng #')) && !profileAttempts.has(customerPsid)) {
      profileAttempts.add(customerPsid);
      (async () => {
        try {
          const pageToken = decryptToken(page.encryptedAccessToken);
          if (pageToken) {
            const profile = await MetaGraphService.getCustomerProfile(customerPsid, pageToken);
            if (profile && (profile.name || profile.profile_pic)) {
              const updated = await prisma.customer.update({
                where: { id: customer.id },
                data: {
                  ...(profile.name ? { name: profile.name } : {}),
                  ...(profile.profile_pic ? { avatar: profile.profile_pic } : {}),
                },
              });
              emitToAccount(page.accountId, 'customer_updated', updated);
            }
          }
        } catch {}
      })();
    }
  } catch (error: any) {
    logger.error('Error handling messaging event:', error.message);
  }
}

/**
 * Handle incoming post comments
 */
async function handleFeedChangeEvent(page: any, value: any) {
  try {
    // 1. Handle live reactions (likes, loves, etc.)
    if (value.item === 'reaction' || value.item === 'like') {
      const postId = value.post_id;
      if (!postId) return;
      const isAdd = value.verb === 'add';
      const post = await prisma.post.findUnique({ where: { metaPostId: postId } });
      if (post) {
        const newLikes = Math.max(0, post.likeCount + (isAdd ? 1 : -1));
        await prisma.post.update({
          where: { id: post.id },
          data: { likeCount: newLikes },
        });
        emitToAccount(page.accountId, 'post_updated', {
          id: post.id,
          likeCount: newLikes,
        });
      }
      return;
    }

    // 2. Handle removed comments
    if (value.item === 'comment' && value.verb === 'remove') {
      const commentId = value.comment_id;
      const postId = value.post_id;
      if (commentId) {
        await prisma.comment.deleteMany({ where: { metaCommentId: commentId } });
      }
      if (postId) {
        const post = await prisma.post.findUnique({ where: { metaPostId: postId } });
        if (post && post.commentCount > 0) {
          await prisma.post.update({
            where: { id: post.id },
            data: { commentCount: { decrement: 1 } },
          });
        }
      }
      return;
    }

    if (value.item !== 'comment' || value.verb !== 'add') {
      return;
    }

    const commentId = value.comment_id;
    const postId = value.post_id;
    const parentId = value.parent_id !== postId ? value.parent_id : null;
    const authorMetaId = value.from?.id;
    const authorName = value.from?.name || `Người dùng #${authorMetaId?.slice(-4) || 'FB'}`;
    const commentMessage = value.message || '';

    // Skip comments posted by the page itself
    if (authorMetaId === page.metaPageId) {
      return;
    }

    // Deduplication
    const existing = await prisma.comment.findUnique({
      where: { metaCommentId: commentId },
    });
    if (existing) return;

    // Ensure Post exists
    let post = await prisma.post.findUnique({
      where: { metaPostId: postId },
    });

    if (!post) {
      post = await prisma.post.create({
        data: {
          pageId: page.id,
          metaPostId: postId,
          message: 'Bài viết Facebook',
          commentCount: 1,
        },
      });
    } else {
      await prisma.post.update({
        where: { id: post.id },
        data: { commentCount: { increment: 1 } },
      });
    }

    // Find parent comment record if this is a reply
    let parentCommentRecord = null;
    if (parentId) {
      parentCommentRecord = await prisma.comment.findUnique({
        where: { metaCommentId: parentId },
      });
    }

    // Upsert Customer (and enrich real name & avatar from Meta API if missing)
    let customer = await prisma.customer.findFirst({
      where: { accountId: page.accountId, metaId: authorMetaId },
    });

    let resolvedName = customer?.name && !customer.name.startsWith('Người dùng') && !customer.name.startsWith('Khách hàng')
      ? customer.name
      : authorName;
    let resolvedAvatar: string | null = customer?.avatar || null;

    if (!resolvedAvatar || resolvedName.startsWith('Người dùng')) {
      try {
        const pageToken = decryptToken(page.encryptedAccessToken);
        if (pageToken && authorMetaId) {
          const prof = await MetaGraphService.getCustomerProfile(authorMetaId, pageToken);
          if (prof?.name) resolvedName = prof.name;
          if (prof?.profile_pic) resolvedAvatar = prof.profile_pic;
        }
      } catch {}
    }

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          accountId: page.accountId,
          primaryPageId: page.id,
          metaId: authorMetaId,
          name: resolvedName,
          avatar: resolvedAvatar,
          status: 'NEW',
          lastInteractionAt: new Date(),
        },
      });
    } else if ((resolvedAvatar && !customer.avatar) || (resolvedName !== customer.name && !resolvedName.startsWith('Người dùng'))) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(resolvedAvatar && !customer.avatar ? { avatar: resolvedAvatar } : {}),
          ...(resolvedName !== customer.name && !resolvedName.startsWith('Người dùng') ? { name: resolvedName } : {}),
          lastInteractionAt: new Date(),
        },
      });
    }

    // Save Comment
    const savedComment = await prisma.comment.create({
      data: {
        pageId: page.id,
        postId: post.id,
        metaCommentId: commentId,
        parentId: parentCommentRecord?.id || null,
        customerId: customer.id,
        authorName: resolvedName,
        authorMetaId,
        message: commentMessage,
        status: 'PENDING',
        isFromPage: false,
        canReplyPrivately: true,
      },
      include: {
        page: { select: { id: true, name: true, avatar: true } },
        post: { select: { id: true, message: true } },
        customer: { select: { id: true, name: true, avatar: true, metaId: true } },
      },
    });

    // Create Notification
    const adminUser = await prisma.user.findFirst({ where: { accountId: page.accountId, role: 'ADMIN' } });
    if (adminUser) {
      const notif = await prisma.notification.create({
        data: {
          userId: adminUser.id,
          title: `Bình luận mới từ ${authorName}`,
          message: commentMessage.slice(0, 100),
          type: 'COMMENT',
          pageId: page.id,
          referenceId: savedComment.id,
        },
      });
      emitToUser(adminUser.id, 'notification', notif);
      emitToAccount(page.accountId, 'notification', notif);
    }

    // Realtime broadcast via Socket.IO
    emitToPage(page.id, 'new_comment', savedComment);
    emitToAccount(page.accountId, 'new_comment', savedComment);
    emitToAccount(page.accountId, 'inbox_updated', {
      type: 'comment',
      id: savedComment.id,
      status: 'PENDING',
    });
  } catch (error: any) {
    logger.error('Error handling feed change event:', error.message);
  }
}
