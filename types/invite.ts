export interface AdminInvite {
  id: string;
  code: string;
  description: string;
  seasonId: string;
  seasonName: string;
  seasonYear: string;
  maxUses: number;
  usedCount: number;
  expiresAt: Date;
  createdAt: Date;
  createdBy: string;
  createdByUsername: string;
  isActive: boolean;
  usedBy: string[]; // Array of user IDs who used this invite
  type?: 'committee_admin' | 'team'; // defaults to committee_admin if not set
}

export interface CreateInviteData {
  seasonId: string;
  description: string;
  maxUses: number;
  expiresInHours: number;
  type?: 'committee_admin' | 'team';
}

export interface InviteUsage {
  inviteId: string;
  inviteCode: string;
  userId: string;
  username: string;
  email: string;
  usedAt: Date;
  seasonId: string;
  seasonName: string;
}
