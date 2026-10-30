import axios from 'axios';
import prisma from '../prisma/client';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { emitToAccount, emitToPage } from './socketService';
import { MetaGraphService } from './metaGraphService';

const GRAPH_BASE_URL = 'https://graph.facebook.com/v19.0';
let isSyncing = false;
const failedProfileCache = new Map<string, number>();

/**
 * Automatically syncs conversations and messages for all connected pages from Meta Graph API.
 * Ensures both new customers and existing customers are always up-to-date in real-time.
 */
export async function syncAllPagesOnce() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pages = await prisma.page.findMany({
      where: { isConnected: true },
      include: { account: true },
    });

    await Promise.allSettled(
      pages.map(async (page) => {
        const pageAccessToken = decryptToken(page.encryptedAccessToken);
        if (!pageAccessToken) return;

        try {
          const convsRes = await axios.get(`${GRAPH_BASE_URL}/${page.metaPageId}/conversations`, {
            params: {
              fields: 'id,updated_time,snippet,unread_count,participants,senders,messages.limit(5){id,message,created_time,from,to,attachments}',
              limit: 8,
              access_token: pageAccessToken,
            },
            timeout: 4000,
          });

          const convs = convsRes.data?.data || [];
          for (const c of convs) {
            const participants = c.participants?.data || c.senders?.data || [];
            const customerParticipant = participants.find((p: any) => p.id !== page.metaPageId) || participants[0];
            if (!customerParticipant) continue;

            const customerPsid = customerParticipant.id;
            const customerName = customerParticipant.name || 'Khách hàng';

            // 1. Upsert Customer
            let customer = await prisma.customer.upsert({
              where: {
                accountId_metaId: {
                  accountId: page.accountId,
                  metaId: customerPsid,
                },
              },
              update: {
                lastInteractionAt: new Date(c.updated_time),
                ...(customerName !== 'Khách hàng' ? { name: customerName } : {}),
              },
              create: {
                accountId: page.accountId,
                primaryPageId: page.id,
                metaId: customerPsid,
                name: customerName,
                status: 'NEW',
                lastInteractionAt: new Date(c.updated_time),
              },
            });

            // 1b. Fetch real customer avatar & name if missing (throttled per PSID)
            const lastFailed = failedProfileCache.get(customerPsid) || 0;
            if ((!customer.avatar || customer.name.startsWith('Khách hàng')) && Date.now() - lastFailed > 120000) {
              try {
                const profile = await MetaGraphService.getCustomerProfile(customerPsid, pageAccessToken);
                if (profile && (profile.profile_pic || profile.name)) {
                  customer = await prisma.customer.update({
                    where: { id: customer.id },
                    data: {
                      ...(profile.profile_pic ? { avatar: profile.profile_pic } : {}),
                      ...(profile.name && customer.name.startsWith('Khách hàng') ? { name: profile.name } : {}),
                    },
                  });
                  emitToAccount(page.accountId, 'customer_updated', customer);
                } else {
                  failedProfileCache.set(customerPsid, Date.now());
                }
              } catch {
                failedProfileCache.set(customerPsid, Date.now());
              }
            }

            // 2. Upsert Conversation
            const conversation = await prisma.conversation.upsert({
              where: {
                pageId_customerId: {
                  pageId: page.id,
                  customerId: customer.id,
                },
              },
              update: {
                metaConversationId: c.id,
                snippet: c.snippet || undefined,
                unreadCount: c.unread_count || 0,
                lastMessageAt: new Date(c.updated_time),
              },
              create: {
                pageId: page.id,
                customerId: customer.id,
                metaConversationId: c.id,
                snippet: c.snippet || null,
                unreadCount: c.unread_count || 0,
                status: 'PENDING',
                lastMessageAt: new Date(c.updated_time),
              },
            });

            // 3. Process recent messages in chronological order (oldest to newest)
            const rawMsgs = (c.messages?.data || []).slice().reverse();
            for (const m of rawMsgs) {
              const isPage = m.from?.id === page.metaPageId;
              const mid = m.id;
              if (!mid) continue;

              const existing = await prisma.message.findUnique({
                where: { metaMessageId: mid },
              });

              if (!existing) {
                const textContent = m.message || (m.attachments ? '[Hình ảnh]' : '');
                const savedMessage = await prisma.message.create({
                  data: {
                    conversationId: conversation.id,
                    pageId: page.id,
                    metaMessageId: mid,
                    senderType: isPage ? 'PAGE' : 'CUSTOMER',
                    senderId: m.from?.id || customerPsid,
                    senderName: m.from?.name || (isPage ? page.name : customer.name),
                    text: textContent,
                    attachments: m.attachments ? JSON.stringify(m.attachments.data || m.attachments) : null,
                    isRead: isPage,
                    sentStatus: 'DELIVERED',
                    createdAt: new Date(m.created_time),
                  },
                });

                // Realtime Socket broadcast
                const msgPayload = {
                  conversationId: conversation.id,
                  pageId: page.id,
                  page: { id: page.id, name: page.name, avatar: page.avatar },
                  message: savedMessage,
                  customer,
                };

                emitToPage(page.id, isPage ? 'message_sent' : 'new_message', msgPayload);
                emitToAccount(page.accountId, isPage ? 'message_sent' : 'new_message', msgPayload);

                emitToAccount(page.accountId, 'conversation_updated', {
                  id: conversation.id,
                  snippet: textContent,
                  unreadCount: conversation.unreadCount,
                  status: conversation.status,
                  lastMessageAt: conversation.lastMessageAt,
                });

                // Notification for staff if from customer
                if (!isPage) {
                  try {
                    const adminUser = await prisma.user.findFirst({
                      where: { accountId: page.accountId, role: 'ADMIN' },
                    });
                    if (adminUser) {
                      await prisma.notification.create({
                        data: {
                          userId: conversation.assignedUserId || adminUser.id,
                          title: `Tin nhắn mới từ ${customer.name}`,
                          message: textContent.substring(0, 100),
                          type: 'MESSENGER',
                          pageId: page.id,
                          referenceId: conversation.id,
                        },
                      });
                    }
                  } catch {
                    // Ignore notification error safely
                  }
                }
              }
            }
          }
        } catch (err: any) {
          // Log quietly without breaking worker
          if (err.response?.status !== 400 && err.response?.status !== 403) {
            logger.warn(`Auto-sync error for page ${page.name}: ${err.message}`);
          }
        }
      })
    );
  } catch (error: any) {
    logger.error('AutoSyncService worker failed:', error.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * Starts continuous background synchronization every 2.5 seconds.
 */
export function startAutoSyncWorker() {
  logger.info('⚡ AutoSync Worker started (ultra-fast interval: 2.5s for instant customer updates).');
  // Initial run after 500ms
  setTimeout(() => {
    syncAllPagesOnce().catch(() => {});
  }, 500);

  // Ultra-fast recurring run every 2.5s
  setInterval(() => {
    syncAllPagesOnce().catch(() => {});
  }, 2500);
}
