export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  avatar?: string;
  accountId: string;
  accountName?: string;
  metaConnected?: boolean;
  metaUser?: {
    id: string;
    metaUserId: string;
    metaUserName: string;
    metaUserEmail?: string;
    status: string;
  } | null;
  connectedPages?: PageSummary[];
}

export interface PageSummary {
  id: string;
  metaPageId: string;
  name: string;
  avatar?: string;
  category?: string;
  followersCount: number;
  isWebhookSubscribed: boolean;
  instagramBusinessId?: string | null;
  instagramUsername?: string | null;
  createdAt: string;
}

export interface AvailableMetaPage {
  id: string;
  name: string;
  category?: string;
  avatar?: string;
  followersCount: number;
  isPublished?: boolean;
  isConnected: boolean;
  instagramBusinessId?: string | null;
  instagramUsername?: string | null;
  tasks?: string[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  _count?: { customers: number };
}

export interface CustomerNote {
  id: string;
  content: string;
  createdAt: string;
  user: {
    fullName: string;
    avatar?: string;
  };
}

export interface Customer {
  id: string;
  name: string;
  metaId: string;
  avatar?: string;
  phone?: string;
  email?: string;
  status: 'NEW' | 'POTENTIAL' | 'PURCHASED' | 'VIP' | 'CARE_NEEDED' | 'COMPLAINT' | 'ARCHIVED';
  lastInteractionAt: string;
  primaryPage?: {
    id: string;
    name: string;
    avatar?: string;
  };
  assignedUser?: {
    id: string;
    fullName: string;
    avatar?: string;
  };
  tags?: { tag: Tag }[];
  notes?: CustomerNote[];
}

export interface Message {
  id: string;
  conversationId: string;
  pageId: string;
  metaMessageId?: string;
  senderType: 'CUSTOMER' | 'PAGE' | 'SYSTEM';
  senderId: string;
  senderName?: string;
  text: string;
  attachments?: string;
  isRead: boolean;
  sentStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  pageId: string;
  customerId: string;
  snippet?: string;
  unreadCount: number;
  status: 'PENDING' | 'PROCESSING' | 'RESOLVED';
  lastMessageAt: string;
  page: {
    id: string;
    name: string;
    avatar?: string;
    metaPageId?: string;
  };
  customer: Customer;
  assignedUser?: {
    id: string;
    fullName: string;
    avatar?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface Post {
  id: string;
  pageId: string;
  metaPostId: string;
  message?: string;
  permalinkUrl?: string;
  picture?: string;
  videoUrl?: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  publishedAt: string;
  page: {
    id: string;
    name: string;
    avatar?: string;
  };
  comments?: CommentItem[];
}

export interface CommentItem {
  id: string;
  pageId: string;
  postId: string;
  metaCommentId: string;
  parentId?: string;
  authorName: string;
  authorMetaId: string;
  message: string;
  status: 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'HIDDEN';
  isFromPage: boolean;
  canReplyPrivately: boolean;
  createdAt: string;
  page: {
    id: string;
    name: string;
    avatar?: string;
  };
  post?: {
    id: string;
    message?: string;
    picture?: string;
    permalinkUrl?: string;
  };
  customer?: Customer;
  assignedUser?: {
    id: string;
    fullName: string;
    avatar?: string;
  };
  replies?: CommentItem[];
}

export interface UnifiedInboxItem {
  id: string;
  type: 'messenger' | 'comment';
  pageId: string;
  pageName: string;
  pageAvatar?: string;
  customer: {
    name: string;
    avatar?: string;
    metaId: string;
    phone?: string;
    status?: string;
    tags?: { tag: Tag }[];
  };
  content: string;
  timestamp: string;
  status: 'PENDING' | 'PROCESSING' | 'RESOLVED';
  unreadCount: number;
  assignedUser?: {
    id: string;
    fullName: string;
    avatar?: string;
  };
  post?: {
    id: string;
    message?: string;
    picture?: string;
    permalinkUrl?: string;
  };
  canReplyPrivately?: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'MESSENGER' | 'COMMENT' | 'ASSIGNMENT' | 'META_CONNECTION' | 'SYSTEM';
  pageId?: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardStats {
  pageCount: number;
  customerCount: number;
  newMessages: number;
  newComments: number;
  pendingMessages: number;
  pendingComments: number;
  totalPosts: number;
  totalFollowers: number;
  adSpend: number;
}
