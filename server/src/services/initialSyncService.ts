import prisma from '../prisma/client';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { MetaGraphService } from './metaGraphService';
import { emitToAccount, emitToPage } from './socketService';

export interface InitialSyncParams {
  pageId: string;
  accountId: string;
  userId?: string;
  userAccessToken?: string;
}

/**
 * Triggers full initial background synchronization immediately after a Page is connected.
 * Syncs:
 * 1. Posts (Facebook & Instagram Media)
 * 2. Comments (Facebook & Instagram)
 * 3. Conversations & Messages (Messenger & Instagram Direct)
 * 4. Ad Accounts & Campaigns (if user token available)
 */
export async function triggerInitialPageSync(params: InitialSyncParams) {
  const { pageId, accountId, userId } = params;

  const runSync = async () => {
    logger.info(`🚀 Starting Initial Auto-Sync for Page ${pageId} (Account: ${accountId})...`);

    try {
      const page = await prisma.page.findFirst({
        where: { id: pageId, accountId },
        include: { metaConnection: true },
      });

      if (!page) {
        logger.warn(`Initial sync aborted: Page ${pageId} not found.`);
        return;
      }

      const pageAccessToken = decryptToken(page.encryptedAccessToken);
      if (!pageAccessToken) {
        logger.warn(`Initial sync aborted: Could not decrypt access token for Page ${page.name}.`);
        return;
      }

      let syncedPostsCount = 0;
      let syncedCommentsCount = 0;
      let syncedConvsCount = 0;
      let syncedAdsCount = 0;

      // ==========================================
      // 1. SYNC POSTS (Facebook Posts & Instagram Media)
      // ==========================================
      try {
        // A. Facebook Posts
        const fbPosts = await MetaGraphService.fetchPagePosts(page.metaPageId, pageAccessToken, 50);
        for (const p of fbPosts) {
          await prisma.post.upsert({
            where: { metaPostId: p.id },
            update: {
              message: p.message || null,
              permalinkUrl: p.permalink_url || null,
              picture: p.full_picture || null,
              videoUrl: p.video_url || null,
              likeCount: p.reactions?.summary?.total_count || 0,
              commentCount: p.comments?.summary?.total_count || 0,
              shareCount: p.shares?.count || 0,
            },
            create: {
              pageId: page.id,
              metaPostId: p.id,
              message: p.message || null,
              permalinkUrl: p.permalink_url || null,
              picture: p.full_picture || null,
              videoUrl: p.video_url || null,
              likeCount: p.reactions?.summary?.total_count || 0,
              commentCount: p.comments?.summary?.total_count || 0,
              shareCount: p.shares?.count || 0,
              publishedAt: p.created_time ? new Date(p.created_time) : new Date(),
            },
          });
          syncedPostsCount++;
        }

        // B. Instagram Media if Page is linked with Instagram
        if (page.instagramBusinessId) {
          try {
            const igMedia = await MetaGraphService.fetchInstagramMedia(page.instagramBusinessId, pageAccessToken, 25);
            for (const media of igMedia) {
              const metaId = `ig_${media.id}`;
              await prisma.post.upsert({
                where: { metaPostId: metaId },
                update: {
                  message: media.caption || null,
                  permalinkUrl: media.permalink || null,
                  picture: media.media_url || media.thumbnail_url || null,
                  videoUrl: media.media_type === 'VIDEO' ? media.media_url : null,
                  likeCount: media.like_count || 0,
                  commentCount: media.comments_count || 0,
                },
                create: {
                  pageId: page.id,
                  metaPostId: metaId,
                  message: media.caption || null,
                  permalinkUrl: media.permalink || null,
                  picture: media.media_url || media.thumbnail_url || null,
                  videoUrl: media.media_type === 'VIDEO' ? media.media_url : null,
                  likeCount: media.like_count || 0,
                  commentCount: media.comments_count || 0,
                  publishedAt: media.timestamp ? new Date(media.timestamp) : new Date(),
                },
              });
              syncedPostsCount++;
            }
          } catch (igErr: any) {
            logger.warn(`Instagram initial media sync warning for Page ${page.name}:`, igErr.message);
          }
        }
      } catch (postErr: any) {
        logger.warn(`Initial post sync error for Page ${page.name}:`, postErr.message);
      }

      // ==========================================
      // 2. SYNC COMMENTS (Facebook & Instagram)
      // ==========================================
      try {
        // A. Media comments (Photos/Videos)
        const mediaComments = await MetaGraphService.fetchAllPageMediaComments(page.metaPageId, pageAccessToken);
        for (const mc of mediaComments) {
          let post = await prisma.post.findFirst({
            where: {
              OR: [
                { metaPostId: mc.mediaId },
                { metaPostId: { endsWith: `_${mc.mediaId}` } },
              ],
            },
          });

          if (!post) {
            post = await prisma.post.create({
              data: {
                pageId: page.id,
                metaPostId: mc.mediaId,
                message: mc.mediaDescription || null,
                likeCount: 0,
                commentCount: 1,
                publishedAt: mc.created_time ? new Date(mc.created_time) : new Date(),
              },
            });
          }

          let customer = await prisma.customer.findFirst({
            where: { accountId, metaId: mc.authorMetaId },
          });

          let mcAvatar = mc.authorAvatar || customer?.avatar || null;
          let mcName = mc.authorName;

          if (!mcAvatar && !mc.authorMetaId.startsWith('user_')) {
            try {
              const prof = await MetaGraphService.getCustomerProfile(mc.authorMetaId, pageAccessToken);
              if (prof?.profile_pic) mcAvatar = prof.profile_pic;
              if (prof?.name && mcName === 'Khách hàng Facebook') mcName = prof.name;
            } catch {}
          }

          if (!customer) {
            customer = await prisma.customer.create({
              data: {
                accountId,
                primaryPageId: page.id,
                metaId: mc.authorMetaId,
                name: mcName,
                avatar: mcAvatar,
                status: 'NEW',
                lastInteractionAt: mc.created_time ? new Date(mc.created_time) : new Date(),
              },
            });
          } else if ((mcAvatar && !customer.avatar) || (mcName !== 'Khách hàng Facebook' && customer.name === 'Khách hàng Facebook')) {
            customer = await prisma.customer.update({
              where: { id: customer.id },
              data: {
                ...(mcAvatar && !customer.avatar ? { avatar: mcAvatar } : {}),
                ...(mcName !== 'Khách hàng Facebook' && customer.name === 'Khách hàng Facebook' ? { name: mcName } : {}),
              },
            });
          }

          await prisma.comment.upsert({
            where: { metaCommentId: mc.commentId },
            update: {
              message: mc.message || '',
              authorName: mcName,
            },
            create: {
              pageId: page.id,
              postId: post.id,
              metaCommentId: mc.commentId,
              customerId: customer.id,
              authorName: mcName,
              authorMetaId: mc.authorMetaId,
              message: mc.message || '',
              createdAt: mc.created_time ? new Date(mc.created_time) : new Date(),
              status: 'PENDING',
              isFromPage: mc.authorMetaId === page.metaPageId,
              canReplyPrivately: mc.authorMetaId !== page.metaPageId,
            },
          });
          syncedCommentsCount++;
        }

        // B. Standard post comments (top 20 posts)
        const recentPosts = await prisma.post.findMany({
          where: { pageId: page.id },
          orderBy: { publishedAt: 'desc' },
          take: 20,
        });

        for (const p of recentPosts) {
          if (p.metaPostId.startsWith('ig_')) continue;
          try {
            const comments = await MetaGraphService.fetchPostComments(p.metaPostId, pageAccessToken);
            for (const c of comments) {
              const authorMetaId = c.from?.id || `user_${c.id}`;
              let authorName = c.from?.name || 'Khách hàng Facebook';
              let authorAvatar: string | null = c.from?.picture?.data?.url || null;

              let customer = await prisma.customer.findFirst({
                where: { accountId, metaId: authorMetaId },
              });

              if ((!authorAvatar || authorName === 'Khách hàng Facebook') && !authorMetaId.startsWith('user_')) {
                try {
                  const prof = await MetaGraphService.getCustomerProfile(authorMetaId, pageAccessToken);
                  if (prof?.profile_pic) authorAvatar = prof.profile_pic;
                  if (prof?.name && authorName === 'Khách hàng Facebook') authorName = prof.name;
                } catch {}
              }

              if (!customer) {
                customer = await prisma.customer.create({
                  data: {
                    accountId,
                    primaryPageId: page.id,
                    metaId: authorMetaId,
                    name: authorName,
                    avatar: authorAvatar,
                    status: 'NEW',
                  },
                });
              } else if ((authorAvatar && !customer.avatar) || (authorName !== 'Khách hàng Facebook' && customer.name === 'Khách hàng Facebook')) {
                customer = await prisma.customer.update({
                  where: { id: customer.id },
                  data: {
                    ...(authorAvatar && !customer.avatar ? { avatar: authorAvatar } : {}),
                    ...(authorName !== 'Khách hàng Facebook' && customer.name === 'Khách hàng Facebook' ? { name: authorName } : {}),
                  },
                });
              }

              await prisma.comment.upsert({
                where: { metaCommentId: c.id },
                update: {
                  message: c.message || '',
                  authorName,
                },
                create: {
                  pageId: page.id,
                  postId: p.id,
                  metaCommentId: c.id,
                  customerId: customer.id,
                  authorName,
                  authorMetaId,
                  message: c.message || '',
                  createdAt: c.created_time ? new Date(c.created_time) : new Date(),
                  status: 'PENDING',
                  isFromPage: authorMetaId === page.metaPageId,
                  canReplyPrivately: authorMetaId !== page.metaPageId,
                },
              });
              syncedCommentsCount++;
            }
          } catch {}
        }
      } catch (commentErr: any) {
        logger.warn(`Initial comment sync error for Page ${page.name}:`, commentErr.message);
      }

      // ==========================================
      // 3. SYNC CONVERSATIONS (Facebook Messenger & Instagram Direct)
      // ==========================================
      try {
        const syncPlatformConvs = async (isInstagram: boolean = false) => {
          try {
            const convs = isInstagram
              ? await MetaGraphService.fetchInstagramConversations(page.metaPageId, pageAccessToken, 20)
              : await MetaGraphService.fetchConversations(page.metaPageId, pageAccessToken);

            for (const c of convs) {
              const otherSender =
                c.senders?.data?.find((s: any) => s.id !== page.metaPageId) ||
                c.participants?.data?.find((p: any) => p.id !== page.metaPageId) ||
                c.senders?.data?.[0];

              const customerName = otherSender?.name || (isInstagram ? 'Khách hàng Instagram' : 'Khách hàng Facebook');
              const customerPsid = otherSender?.id || c.id;

              let customer = await prisma.customer.findUnique({
                where: {
                  accountId_metaId: {
                    accountId,
                    metaId: customerPsid,
                  },
                },
              });

              let finalName = customerName;
              let finalAvatar: string | null = null;

              // Fetch customer profile & avatar from Meta if missing
              if (!customer || !customer.avatar || customer.name.startsWith('Khách hàng')) {
                try {
                  const profile = await MetaGraphService.getCustomerProfile(customerPsid, pageAccessToken);
                  if (profile) {
                    if (profile.name) finalName = profile.name;
                    if (profile.profile_pic) finalAvatar = profile.profile_pic;
                  }
                } catch {}
              }

              customer = await prisma.customer.upsert({
                where: {
                  accountId_metaId: {
                    accountId,
                    metaId: customerPsid,
                  },
                },
                update: {
                  lastInteractionAt: new Date(c.updated_time),
                  ...(finalAvatar && !customer?.avatar ? { avatar: finalAvatar } : {}),
                  ...(customer?.name.startsWith('Khách hàng') && finalName !== customer?.name ? { name: finalName } : {}),
                },
                create: {
                  accountId,
                  primaryPageId: page.id,
                  metaId: customerPsid,
                  name: finalName,
                  avatar: finalAvatar,
                  lastInteractionAt: new Date(c.updated_time),
                },
              });

              const conv = await prisma.conversation.upsert({
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

              // Process messages in conversation
              const rawMsgs = c.messages?.data || [];
              for (const m of rawMsgs) {
                const isFromPage = m.from?.id === page.metaPageId;
                const existing = await prisma.message.findUnique({
                  where: { metaMessageId: m.id },
                });

                if (!existing) {
                  let attachmentsJson: string | null = null;
                  if (m.attachments?.data) {
                    attachmentsJson = JSON.stringify(m.attachments.data);
                  }

                  await prisma.message.create({
                    data: {
                      conversationId: conv.id,
                      pageId: page.id,
                      metaMessageId: m.id,
                      senderType: isFromPage ? 'PAGE' : 'CUSTOMER',
                      senderId: m.from?.id || customerPsid,
                      senderName: m.from?.name || (isFromPage ? page.name : customer.name),
                      text: m.message || (attachmentsJson ? '[Tệp đính kèm]' : ''),
                      attachments: attachmentsJson,
                      isRead: isFromPage,
                      sentStatus: 'DELIVERED',
                      createdAt: new Date(m.created_time),
                    },
                  });
                }
              }
              syncedConvsCount++;
            }
          } catch (platErr: any) {
            logger.warn(`Conversation sync warning (${isInstagram ? 'Instagram' : 'Messenger'}):`, platErr.message);
          }
        };

        // Sync Facebook Messenger
        await syncPlatformConvs(false);

        // Sync Instagram Direct if linked
        if (page.instagramBusinessId) {
          await syncPlatformConvs(true);
        }
      } catch (convErr: any) {
        logger.warn(`Initial conversation sync error for Page ${page.name}:`, convErr.message);
      }

      // ==========================================
      // 4. SYNC AD ACCOUNTS & CAMPAIGNS
      // ==========================================
      try {
        let userToken = params.userAccessToken;
        if (!userToken && page.metaConnection?.encryptedAccessToken) {
          userToken = decryptToken(page.metaConnection.encryptedAccessToken) || undefined;
        }

        if (userToken) {
          const rawAccounts = await MetaGraphService.fetchAdAccounts(userToken);
          for (const raw of rawAccounts) {
            const adAccount = await prisma.adAccount.upsert({
              where: { metaAdAccountId: raw.id },
              update: {
                name: raw.name || raw.id,
                currency: raw.currency || 'VND',
                accountStatus: raw.account_status || 1,
                amountSpent: Number(raw.amount_spent || 0) / 100,
              },
              create: {
                accountId,
                metaAdAccountId: raw.id,
                name: raw.name || raw.id,
                currency: raw.currency || 'VND',
                accountStatus: raw.account_status || 1,
                amountSpent: Number(raw.amount_spent || 0) / 100,
              },
            });

            const campaigns = await MetaGraphService.fetchCampaigns(raw.id, userToken);
            for (const c of campaigns) {
              await prisma.campaign.upsert({
                where: { metaCampaignId: c.id },
                update: {
                  name: c.name,
                  objective: c.objective || null,
                  status: c.status || 'ACTIVE',
                  dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
                  lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
                },
                create: {
                  adAccountId: adAccount.id,
                  metaCampaignId: c.id,
                  name: c.name,
                  objective: c.objective || null,
                  status: c.status || 'ACTIVE',
                  dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
                  lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
                },
              });
            }
            syncedAdsCount++;
          }
        }
      } catch (adErr: any) {
        logger.warn(`Ad accounts initial sync notice for Page ${page.name}: ${adErr.message}`);
      }

      logger.info(
        `✅ Initial Auto-Sync for Page ${page.name} completed successfully: ` +
        `${syncedPostsCount} bài viết, ${syncedCommentsCount} bình luận, ${syncedConvsCount} hội thoại, ${syncedAdsCount} tài khoản quảng cáo.`
      );

      // Create notification for admin
      if (userId) {
        await prisma.notification.create({
          data: {
            userId,
            title: `Đồng bộ hoàn tất: ${page.name}`,
            message: `Hệ thống đã tự động đồng bộ ${syncedPostsCount} bài viết, ${syncedCommentsCount} bình luận và ${syncedConvsCount} hội thoại từ Meta.`,
            type: 'META_CONNECTION',
            pageId: page.id,
          },
        }).catch(() => {});
      }

      // Notify clients in realtime
      emitToAccount(accountId, 'initial_sync_completed', {
        pageId: page.id,
        pageName: page.name,
        syncedPostsCount,
        syncedCommentsCount,
        syncedConvsCount,
        syncedAdsCount,
      });
      emitToPage(page.id, 'page_updated', { id: page.id, name: page.name });
    } catch (err: any) {
      logger.error(`Initial Auto-Sync error for Page ${pageId}:`, err.message);
    }
  };

  if (process.env.VERCEL) {
    await runSync();
  } else {
    setImmediate(runSync);
  }
}
