import axios from 'axios';
import { logger } from '../utils/logger';

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphService {
  /**
   * Generates the official Meta Facebook OAuth URL
   */
  static getOAuthUrl(appId: string, redirectUri: string, state: string): string {
    // Danh sách quyền cốt lõi an toàn, không bị Meta chặn trong popup OAuth:
    const defaultScopes = [
      'public_profile',
      'pages_show_list',
      'pages_messaging',
      'pages_read_engagement',
      'pages_manage_metadata',
      'ads_read',
      'business_management',
    ];

    // Cho phép tùy biến danh sách scopes qua biến môi trường META_OAUTH_SCOPES trong server/.env
    const envScopes = process.env.META_OAUTH_SCOPES
      ? process.env.META_OAUTH_SCOPES.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const scopes = envScopes && envScopes.length > 0 ? envScopes : defaultScopes;

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state: state,
      response_type: 'code',
      scope: scopes.join(','),
    });

    return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for short-lived user access token
   */
  static async exchangeCodeForToken(appId: string, appSecret: string, redirectUri: string, code: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/oauth/access_token`, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code: code,
        },
      });
      return response.data; // { access_token, token_type, expires_in }
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error('Meta OAuth exchange code error:', fbError || error.message);
      throw new Error(fbError?.message || 'Không thể xác thực mã OAuth với Meta.');
    }
  }

  /**
   * Exchanges short-lived user access token for a 60-day long-lived access token
   */
  static async getLongLivedUserToken(appId: string, appSecret: string, shortLivedToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
      });
      return response.data; // { access_token, token_type, expires_in }
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error('Meta get long-lived token error:', fbError || error.message);
      throw new Error(fbError?.message || 'Không thể tạo long-lived access token từ Meta.');
    }
  }

  /**
   * Retrieves user profile from Meta
   */
  static async getUserProfile(userAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/me`, {
        params: {
          fields: 'id,name,email,picture',
          access_token: userAccessToken,
        },
      });
      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error('Meta get user profile error:', fbError || error.message);
      throw new Error(fbError?.message || 'Không thể lấy thông tin người dùng từ Meta.');
    }
  }

  /**
   * Retrieves customer profile (name, first_name, last_name, profile_pic) using PSID/User ID and Page Access Token
   * Automatically falls back to /picture endpoint if profile_pic field is restricted.
   */
  static async getCustomerProfile(psid: string, pageAccessToken: string) {
    if (!psid || psid.startsWith('user_')) return null;

    let name: string | undefined;
    let firstName: string | undefined;
    let lastName: string | undefined;
    let profilePic: string | undefined;

    // Step 1: Try full Messenger PSID profile fields + picture edge
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${psid}`, {
        params: {
          fields: 'id,name,first_name,last_name,profile_pic,picture.width(200).height(200){url}',
          access_token: pageAccessToken,
        },
        timeout: 4500,
      });
      const d = response.data;
      if (d) {
        name = d.name || [d.first_name, d.last_name].filter(Boolean).join(' ') || undefined;
        firstName = d.first_name;
        lastName = d.last_name;
        profilePic = d.profile_pic || d.picture?.data?.url;
      }
    } catch {
      // Step 2: Fallback for Comment User IDs or restricted PSIDs where profile_pic field is not allowed
      try {
        const fallbackRes = await axios.get(`${GRAPH_BASE_URL}/${psid}`, {
          params: {
            fields: 'id,name,picture.width(200).height(200){url}',
            access_token: pageAccessToken,
          },
          timeout: 4000,
        });
        const d = fallbackRes.data;
        if (d) {
          name = d.name || undefined;
          profilePic = d.picture?.data?.url;
        }
      } catch {}
    }

    // Step 3: If still missing avatar, query /{psid}/picture?redirect=false&type=large directly
    if (!profilePic) {
      try {
        const picRes = await axios.get(`${GRAPH_BASE_URL}/${psid}/picture`, {
          params: {
            redirect: false,
            type: 'large',
            width: 200,
            height: 200,
            access_token: pageAccessToken,
          },
          timeout: 3500,
        });
        if (picRes.data?.data?.url && !picRes.data?.data?.is_silhouette) {
          profilePic = picRes.data.data.url;
        } else if (picRes.data?.data?.url) {
          profilePic = picRes.data.data.url;
        }
      } catch {}
    }

    if (!name && !profilePic) return null;

    return {
      id: psid,
      name,
      first_name: firstName,
      last_name: lastName,
      profile_pic: profilePic || null,
    };
  }

  /**
   * Retrieves page details directly using a page access token or page ID
   */
  static async getPageDetails(pageIdOrMe: string, accessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${pageIdOrMe}`, {
        params: {
          fields: 'id,name,category,picture.width(200).height(200),followers_count,is_published,access_token,instagram_business_account{id,username,name,profile_picture_url}',
          access_token: accessToken,
        },
      });
      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error('Meta get page details error:', fbError || error.message);
      throw new Error(fbError?.message || 'Không thể lấy thông tin Page từ Meta với Access Token đã cung cấp.');
    }
  }

  /**
   * Retrieves list of Facebook Pages managed by the user (including linked Instagram account)
   */
  static async getManagedPages(userAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/me/accounts`, {
        params: {
          fields: 'id,name,access_token,category,picture.width(200).height(200),followers_count,is_published,tasks,instagram_business_account{id,username,name,profile_picture_url}',
          limit: 100,
          access_token: userAccessToken,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error('Meta get managed pages error:', fbError || error.message);
      throw new Error(fbError?.message || 'Không thể lấy danh sách Page từ Meta.');
    }
  }

  /**
   * Subscribes a Facebook Page to webhook events (Auto-Subscribe like Pancake)
   */
  static async subscribePageToWebhook(pageId: string, pageAccessToken: string) {
    const subscribedFields = 'messages,messaging_postbacks,message_reads,message_deliveries,feed';
    try {
      const response = await axios.post(
        `${GRAPH_BASE_URL}/${pageId}/subscribed_apps`,
        {
          subscribed_fields: subscribedFields,
        },
        {
          params: {
            subscribed_fields: subscribedFields,
            access_token: pageAccessToken,
          },
        }
      );
      const isOk = response.data?.success === true;
      if (isOk) {
        logger.info(`✅ Webhook auto-subscribed successfully for Page ${pageId} with fields: [${subscribedFields}]`);
      } else {
        logger.warn(`⚠️ Webhook subscribe response for Page ${pageId}:`, response.data);
      }
      return isOk;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error(`❌ Meta subscribe page webhook error for Page ${pageId}:`, fbError?.message || error.message);
      return false;
    }
  }

  /**
   * Fetches Instagram Media (Posts/Reels) for a linked Instagram Business Account
   */
  static async fetchInstagramMedia(igUserId: string, pageAccessToken: string, limit: number = 25) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${igUserId}/media`, {
        params: {
          fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,thumbnail_url',
          limit,
          access_token: pageAccessToken,
        },
        timeout: 8000,
      });
      return response.data?.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Instagram fetch media error for IG ${igUserId}:`, fbError?.message || error.message);
      return [];
    }
  }

  /**
   * Fetches comments for an Instagram Media item
   */
  static async fetchInstagramMediaComments(igMediaId: string, pageAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${igMediaId}/comments`, {
        params: {
          fields: 'id,text,timestamp,username,from{id,username},like_count',
          access_token: pageAccessToken,
        },
        timeout: 6000,
      });
      return response.data?.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Instagram fetch comments error for Media ${igMediaId}:`, fbError?.message || error.message);
      return [];
    }
  }

  /**
   * Fetches Instagram Direct Messages / Conversations
   */
  static async fetchInstagramConversations(pageId: string, pageAccessToken: string, limit: number = 20) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${pageId}/conversations`, {
        params: {
          platform: 'instagram',
          fields: 'id,snippet,updated_time,unread_count,senders,messages.limit(20){id,message,created_time,from,attachments}',
          limit,
          access_token: pageAccessToken,
        },
        timeout: 8000,
      });
      return response.data?.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Instagram conversations error for Page ${pageId}:`, fbError?.message || error.message);
      return [];
    }
  }

  /**
   * Fetches Facebook Messenger Conversations for a Page
   */
  static async fetchConversations(pageId: string, pageAccessToken: string, limit: number = 20) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${pageId}/conversations`, {
        params: {
          fields: 'id,snippet,updated_time,unread_count,senders,messages.limit(20){id,message,created_time,from,attachments}',
          limit,
          access_token: pageAccessToken,
        },
        timeout: 8000,
      });
      return response.data?.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Messenger conversations error for Page ${pageId}:`, fbError?.message || error.message);
      return [];
    }
  }

  /**
   * Sends a Messenger message to a recipient PSID
   */
  static async sendMessengerMessage(
    pageId: string,
    pageAccessToken: string,
    recipientPsid: string,
    messageText: string
  ) {
    try {
      const response = await axios.post(
        `${GRAPH_BASE_URL}/${pageId}/messages`,
        {
          recipient: { id: recipientPsid },
          message: { text: messageText },
        },
        {
          params: { access_token: pageAccessToken },
        }
      );
      return response.data; // { recipient_id, message_id }
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error(`Send Messenger message error for Page ${pageId}:`, fbError || error.message);
      throw new Error(fbError?.message || 'Gửi tin nhắn Messenger thất bại qua Meta API.');
    }
  }

  /**
   * Sends an image attachment to a recipient PSID via Meta Send API (multipart/form-data)
   */
  static async sendMessengerImage(
    pageId: string,
    pageAccessToken: string,
    recipientPsid: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ) {
    try {
      const formData = new FormData();
      formData.append('recipient', JSON.stringify({ id: recipientPsid }));
      formData.append(
        'message',
        JSON.stringify({
          attachment: {
            type: 'image',
            payload: { is_reusable: true },
          },
        })
      );
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('filedata', blob, filename);

      const response = await axios.post(
        `${GRAPH_BASE_URL}/${pageId}/messages`,
        formData,
        {
          params: { access_token: pageAccessToken },
        }
      );
      return response.data; // { recipient_id, message_id, attachment_id }
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error(`Send Messenger image error for Page ${pageId}:`, fbError || error.message);
      throw new Error(fbError?.message || 'Gửi ảnh qua Meta API thất bại.');
    }
  }

  /**
   * Replies to a Comment on Facebook
   */
  static async replyToComment(
    commentId: string,
    pageAccessToken: string,
    messageText: string
  ) {
    try {
      const response = await axios.post(
        `${GRAPH_BASE_URL}/${commentId}/comments`,
        { message: messageText },
        { params: { access_token: pageAccessToken } }
      );
      return response.data; // { id: new_comment_id }
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error(`Reply comment error for Comment ${commentId}:`, fbError || error.message);
      throw new Error(fbError?.message || 'Trả lời comment thất bại qua Meta API.');
    }
  }

  /**
   * Sends a Private Reply (Messenger) to a comment author if supported
   */
  static async sendPrivateReplyToComment(
    pageId: string,
    pageAccessToken: string,
    commentId: string,
    messageText: string
  ) {
    try {
      const response = await axios.post(
        `${GRAPH_BASE_URL}/${pageId}/messages`,
        {
          recipient: { comment_id: commentId },
          message: { text: messageText },
        },
        { params: { access_token: pageAccessToken } }
      );
      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error(`Private reply error for Comment ${commentId}:`, fbError || error.message);
      throw new Error(fbError?.message || 'Không thể gửi tin nhắn riêng cho người bình luận này (Meta giới hạn thời gian hoặc quyền).');
    }
  }

  /**
   * Fetches posts from a Facebook Page
   */
  static async fetchPagePosts(pageId: string, pageAccessToken: string, limit = 50) {
    try {
      // 1. Fetch posts with attachments
      const [postsRes, photosRes, videosRes] = await Promise.allSettled([
        axios.get(`${GRAPH_BASE_URL}/${pageId}/posts`, {
          params: {
            fields: 'id,message,created_time,permalink_url,full_picture,shares,attachments{target,subattachments,type,media,url}',
            limit,
            access_token: pageAccessToken,
          },
        }),
        axios.get(`${GRAPH_BASE_URL}/${pageId}/photos`, {
          params: {
            type: 'uploaded',
            fields: 'id,likes.summary(true),comments.summary(true)',
            limit: 30,
            access_token: pageAccessToken,
          },
        }),
        axios.get(`${GRAPH_BASE_URL}/${pageId}/videos`, {
          params: {
            fields: 'id,description,created_time,permalink_url,picture,source',
            limit: 25,
            access_token: pageAccessToken,
          },
        }),
      ]);

      const rawPosts = postsRes.status === 'fulfilled' ? postsRes.value.data?.data || [] : [];
      const mediaMap = new Map<string, { likes: number; comments: number; description?: string; source?: string }>();

      if (photosRes.status === 'fulfilled') {
        for (const photo of photosRes.value.data?.data || []) {
          mediaMap.set(photo.id, {
            likes: photo.likes?.summary?.total_count || 0,
            comments: photo.comments?.summary?.total_count || 0,
          });
        }
      }

      const videoList: any[] = [];
      if (videosRes.status === 'fulfilled') {
        for (const video of videosRes.value.data?.data || []) {
          const vData = {
            likes: 0,
            comments: 0,
            description: video.description,
            source: video.source,
          };
          mediaMap.set(video.id, vData);
          videoList.push(video);
        }
      }

      const handledVideoIds = new Set<string>();

      const mappedPosts = rawPosts.map((post: any) => {
        let postLikes = 0;
        let postComments = 0;
        let videoUrl: string | null = null;

        const atts = post.attachments?.data || [];
        for (const a of atts) {
          if (a.media?.source) {
            videoUrl = a.media.source;
          }
          if (a.target?.id && mediaMap.has(a.target.id)) {
            const mData = mediaMap.get(a.target.id)!;
            postLikes = Math.max(postLikes, mData.likes);
            postComments = Math.max(postComments, mData.comments);
            if (mData.source) videoUrl = mData.source;
            handledVideoIds.add(a.target.id);
          }
          for (const sub of a.subattachments?.data || []) {
            if (sub.media?.source) {
              videoUrl = sub.media.source;
            }
            if (sub.target?.id && mediaMap.has(sub.target.id)) {
              const subData = mediaMap.get(sub.target.id)!;
              postLikes += subData.likes;
              postComments += subData.comments;
              if (subData.source) videoUrl = subData.source;
              handledVideoIds.add(sub.target.id);
            }
          }
        }

        // Match video by reel permalink URL if videoUrl not found yet
        if (!videoUrl && post.permalink_url) {
          const reelMatch = post.permalink_url.match(/\/reel\/(\d+)/);
          if (reelMatch && reelMatch[1] && mediaMap.has(reelMatch[1])) {
            const rData = mediaMap.get(reelMatch[1])!;
            if (rData.source) videoUrl = rData.source;
            handledVideoIds.add(reelMatch[1]);
          }
        }

        // Match video by description text if target ID was a Reel ID
        if (postLikes === 0 && postComments === 0 && post.message) {
          const clean = post.message.substring(0, 30).trim();
          for (const [vId, vm] of mediaMap.entries()) {
            if (vm.description && vm.description.includes(clean)) {
              postLikes = vm.likes;
              postComments = vm.comments;
              if (vm.source && !videoUrl) videoUrl = vm.source;
              handledVideoIds.add(vId);
              break;
            }
          }
        }

        return {
          ...post,
          video_url: videoUrl,
          reactions: { summary: { total_count: postLikes } },
          comments: { summary: { total_count: postComments } },
        };
      });

      // Also append standalone videos/reels that have source or descriptions
      for (const v of videoList) {
        if (!handledVideoIds.has(v.id)) {
          mappedPosts.push({
            id: v.id,
            message: v.description || '',
            created_time: v.created_time,
            permalink_url: v.permalink_url ? (v.permalink_url.startsWith('http') ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : `https://www.facebook.com/reel/${v.id}`,
            full_picture: v.picture || null,
            video_url: v.source || null,
            shares: { count: 0 },
            reactions: { summary: { total_count: 0 } },
            comments: { summary: { total_count: 0 } },
          });
        }
      }

      return mappedPosts;
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.error(`Fetch posts error for Page ${pageId}:`, fbError || error.message);
      throw new Error(fbError?.message || 'Không thể tải bài viết từ Meta.');
    }
  }

  /**
   * Fetches comments for a specific post (with fallback to media endpoint if feed comments require pages_read_user_content)
   */
  static async fetchPostComments(postId: string, pageAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${postId}/comments`, {
        params: {
          fields: 'id,from{id,name,picture.width(200).height(200){url}},message,created_time,comment_count,parent,can_comment,can_remove,can_hide,comments{id,from{id,name,picture.width(200).height(200){url}},message,created_time}',
          limit: 50,
          access_token: pageAccessToken,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      // Fallback 1: standard from field on postId
      try {
        const resSimple = await axios.get(`${GRAPH_BASE_URL}/${postId}/comments`, {
          params: {
            fields: 'id,from,message,created_time,comment_count,parent,comments{id,from,message,created_time}',
            limit: 50,
            access_token: pageAccessToken,
          },
        });
        return resSimple.data.data || [];
      } catch {
        // Fallback 2: stripped pureId
        try {
          const pureId = postId.includes('_') ? postId.split('_')[1] : postId;
          const fallbackRes = await axios.get(`${GRAPH_BASE_URL}/${pureId}/comments`, {
            params: {
              fields: 'id,from{id,name,picture.width(200).height(200){url}},message,created_time',
              limit: 50,
              access_token: pageAccessToken,
            },
          });
          return fallbackRes.data.data || [];
        } catch (innerErr: any) {
          logger.warn(`Fetch comments fallback also failed for Post ${postId}: ${innerErr.message}`);
          return [];
        }
      }
    }
  }

  /**
   * Fetches all real customer comments across all media (videos and photos) on the Page
   */
  static async fetchAllPageMediaComments(pageId: string, pageAccessToken: string) {
    const allComments: Array<{
      commentId: string;
      message: string;
      created_time: string;
      authorName: string;
      authorMetaId: string;
      authorAvatar?: string | null;
      mediaId: string;
      mediaDescription?: string;
    }> = [];

    try {
      // 1. Scan videos
      let nextUrl: string | null = `${GRAPH_BASE_URL}/${pageId}/videos?fields=id,description,created_time&limit=25&access_token=${pageAccessToken}`;
      let videoCount = 0;

      while (nextUrl && videoCount < 75) {
        try {
          const res: any = await axios.get(nextUrl);
          const videos = res.data?.data || [];
          videoCount += videos.length;

          for (const v of videos) {
            try {
              const cRes = await axios.get(`${GRAPH_BASE_URL}/${v.id}/comments`, {
                params: {
                  fields: 'id,message,created_time,from{id,name,picture.width(200).height(200){url}}',
                  limit: 25,
                  access_token: pageAccessToken,
                },
              });
              for (const c of cRes.data.data || []) {
                allComments.push({
                  commentId: c.id,
                  message: c.message || '',
                  created_time: c.created_time,
                  authorName: c.from?.name || 'Khách hàng Facebook',
                  authorMetaId: c.from?.id || `user_${c.id}`,
                  authorAvatar: c.from?.picture?.data?.url || null,
                  mediaId: v.id,
                  mediaDescription: v.description,
                });
              }
            } catch (vErr) {
              // skip non-commentable video
            }
          }
          nextUrl = res.data.paging?.next || null;
        } catch (pageErr) {
          break;
        }
      }
    } catch (e: any) {
      logger.warn(`Media comments scan error for Page ${pageId}: ${e.message}`);
    }

    return allComments;
  }

  /**
   * Fetches Page Insights
   */
  static async fetchPageInsights(pageId: string, pageAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${pageId}/insights`, {
        params: {
          metric: 'page_impressions,page_engaged_users,page_post_engagements,page_views_total',
          period: 'day',
          access_token: pageAccessToken,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Fetch insights for Page ${pageId}: ${fbError?.message || error.message}`);
      return [];
    }
  }

  /**
   * Fetches Ad Accounts associated with the user
   */
  static async fetchAdAccounts(userAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/me/adaccounts`, {
        params: {
          fields: 'id,name,account_status,currency,amount_spent',
          access_token: userAccessToken,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Fetch Ad Accounts: ${fbError?.message || error.message}`);
      return [];
    }
  }

  /**
   * Fetches Campaigns for an Ad Account
   */
  static async fetchCampaigns(adAccountId: string, userAccessToken: string) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${adAccountId}/campaigns`, {
        params: {
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time',
          access_token: userAccessToken,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Fetch Campaigns for ${adAccountId}: ${fbError?.message || error.message}`);
      return [];
    }
  }

  /**
   * Fetches Insights for an Ad Account
   */
  static async fetchAdAccountInsights(adAccountId: string, userAccessToken: string, datePreset = 'last_30d') {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${adAccountId}/insights`, {
        params: {
          fields: 'spend,impressions,reach,clicks,cpc,cpm,ctr,actions',
          date_preset: datePreset,
          access_token: userAccessToken,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      logger.warn(`Fetch Ad Insights for ${adAccountId}: ${fbError?.message || error.message}`);
      return [];
    }
  }

  /**
   * Validates access token and inspects scopes/expiration.
   * Falls back to /me verification if token belongs to a different App ID (e.g. Graph API Explorer).
   */
  static async validateToken(token: string, appId?: string, appSecret?: string) {
    if (appId && appSecret) {
      try {
        const appToken = `${appId}|${appSecret}`;
        const response = await axios.get(`${GRAPH_BASE_URL}/debug_token`, {
          params: {
            input_token: token,
            access_token: appToken,
          },
          timeout: 4000,
        });
        if (response.data?.data) {
          return response.data.data;
        }
      } catch {
        // Fallback below if App ID does not match Viewing App
      }
    }

    try {
      const meRes = await axios.get(`${GRAPH_BASE_URL}/me`, {
        params: {
          fields: 'id,name',
          access_token: token,
        },
        timeout: 4000,
      });
      if (meRes.data?.id) {
        return { is_valid: true, user_id: meRes.data.id, scopes: [] };
      }
      return { is_valid: false };
    } catch (error: any) {
      logger.warn('Validate token fallback error:', error.response?.data?.error?.message || error.message);
      return { is_valid: false };
    }
  }
}
