import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword,
  User as FirebaseUser,
  UserCredential,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { auth, db } from './config';
import { User, UserRole, Team, CommitteeAdmin, SuperAdmin } from '@/types/user';

// Convert Firestore timestamp to Date
const convertTimestamp = (timestamp: any): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date();
};

// Create a new user in Firestore
export const createUserDocument = async (
  uid: string,
  email: string,
  username: string,
  role: UserRole,
  additionalData?: any
): Promise<User> => {
  const userRef = doc(db, 'users', uid);
  
  const baseUserData = {
    uid,
    email,
    username,
    role,
    isActive: true,
    // Approval System:
    // - Teams (role='team'): isApproved = false (require super admin approval)
    // - Committee Admins & Super Admins: isApproved = true (auto-approved)
    isApproved: role !== 'team',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  let userData: any = { ...baseUserData };

  // Add role-specific data
  switch (role) {
    case 'super_admin':
      userData.permissions = additionalData?.permissions || ['all'];
      break;
    case 'committee_admin':
      userData.seasonId = additionalData?.seasonId || '';
      userData.seasonName = additionalData?.seasonName || '';
      userData.seasonYear = additionalData?.seasonYear || '';
      userData.committeeId = additionalData?.committeeId || '';
      userData.committeeName = additionalData?.committeeName || '';
      userData.permissions = additionalData?.permissions || ['manage_teams', 'manage_auctions'];
      userData.canManageTeams = additionalData?.canManageTeams ?? true;
      userData.canManageAuctions = additionalData?.canManageAuctions ?? true;
      break;
        case 'team':
      userData.teamName = additionalData?.teamName || '';
      userData.teamLogo = additionalData?.teamLogo || '';
      userData.ownerName = additionalData?.ownerName || '';
      userData.seasonId = additionalData?.seasonId || '';
      userData.seasonName = additionalData?.seasonName || '';
      userData.players = additionalData?.players || [];
      userData.committeeId = additionalData?.committeeId || '';
      break;
  }

  await setDoc(userRef, userData);

  // Fetch and return the created user
  const userDoc = await getDoc(userRef);
  const data = userDoc.data();
  
  return {
    ...data,
    createdAt: convertTimestamp(data?.createdAt),
    updatedAt: convertTimestamp(data?.updatedAt),
  } as User;
};

// Get user document from Firestore with retry logic
export const getUserDocument = async (uid: string, retryCount = 0): Promise<User | null> => {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return null;
    }

    const data = userDoc.data();
    return {
      ...data,
      createdAt: convertTimestamp(data.createdAt),
      updatedAt: convertTimestamp(data.updatedAt),
    } as User;
  } catch (error: any) {
    // Handle permission-denied errors with retry logic
    if (error.code === 'permission-denied' && retryCount < maxRetries) {
      console.warn(`Permission denied for user ${uid}, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Retry with exponential backoff
      return getUserDocument(uid, retryCount + 1);
    }
    
    // Log non-permission errors or exhausted retries
    if (!error.code?.includes('permission-denied') || retryCount >= maxRetries) {
      console.error('Error getting user document:', {
        uid,
        error: error.message,
        code: error.code,
        retryCount
      });
    }
    
    return null;
  }
};

// Sign up a new user
export const signUp = async (
  email: string,
  password: string,
  username: string,
  role: UserRole = 'team',
  additionalData?: any
): Promise<{ user: User; firebaseUser: FirebaseUser }> => {
  try {
    // Check if username is available
export const isUsernameAvailable = async (username: string): Promise<boolean> => {
  try {
    const cleanLower = username.toLowerCase().trim();
    const strippedLower = cleanLower.replace(/[^a-z0-9]/g, '');

    const usersRef = doc(db, 'usernames', cleanLower);
    const docSnap = await getDoc(usersRef);
    if (docSnap.exists()) return false;

    if (strippedLower && strippedLower !== cleanLower) {
      const strippedRef = doc(db, 'usernames', strippedLower);
      const strippedSnap = await getDoc(strippedRef);
      if (strippedSnap.exists()) return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking username availability:', error);
    return false;
  }
};

// Reserve username
export const reserveUsername = async (username: string, uid: string): Promise<void> => {
  try {
    const cleanLower = username.toLowerCase().trim();
    const strippedLower = cleanLower.replace(/[^a-z0-9]/g, '');

    await setDoc(doc(db, 'usernames', cleanLower), {
      uid,
      userId: uid,
      username: username.trim(),
      createdAt: serverTimestamp(),
    });

    if (strippedLower && strippedLower !== cleanLower) {
      await setDoc(doc(db, 'usernames', strippedLower), {
        uid,
        userId: uid,
        username: username.trim(),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error: any) {
    console.error('Error reserving username:', error);
    throw new Error(error.message || 'Failed to reserve username');
  }
};

// Get all users (Super Admin only)
export const getAllUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users: User[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        ...data,
        createdAt: convertTimestamp(data.createdAt),
        updatedAt: convertTimestamp(data.updatedAt),
      } as User);
    });
    
    return users;
  } catch (error: any) {
    console.error('Error getting all users:', error);
    throw new Error(error.message || 'Failed to get all users');
  }
};

// Update user role (Super Admin only)
export const updateUserRole = async (uid: string, newRole: UserRole): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Error updating user role:', error);
    throw new Error(error.message || 'Failed to update user role');
  }
};

// Toggle user active status (Super Admin only)
export const toggleUserStatus = async (uid: string, isActive: boolean): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Error toggling user status:', error);
    throw new Error(error.message || 'Failed to toggle user status');
  }
};

// Delete user (Super Admin only)
export const deleteUser = async (uid: string): Promise<void> => {
  try {
    // Get username before deleting user document
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const username = userDoc.data().username;
      
      // Delete user document
      await deleteDoc(doc(db, 'users', uid));
      
      // Delete username reservation
      if (username) {
        const cleanLower = username.toLowerCase().trim();
        const strippedLower = cleanLower.replace(/[^a-z0-9]/g, '');
        await deleteDoc(doc(db, 'usernames', cleanLower)).catch(() => {});
        if (strippedLower && strippedLower !== cleanLower) {
          await deleteDoc(doc(db, 'usernames', strippedLower)).catch(() => {});
        }
      }
    }
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new Error(error.message || 'Failed to delete user');
  }
};

// Get pending users (users waiting for approval)
export const getPendingUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('isApproved', '==', false));
    const querySnapshot = await getDocs(q);
    
    const users: User[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        ...data,
        createdAt: convertTimestamp(data.createdAt),
        updatedAt: convertTimestamp(data.updatedAt),
        approvedAt: data.approvedAt ? convertTimestamp(data.approvedAt) : undefined,
      } as User);
    });
    
    return users;
  } catch (error: any) {
    console.error('Error getting pending users:', error);
    throw new Error(error.message || 'Failed to get pending users');
  }
};

// Approve user (Super Admin only)
export const approveUser = async (uid: string, approvedBy: string): Promise<void> => {
  try {
    // Get user document to retrieve role
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    const userRole = userData.role;
    
    // Update user document
    await updateDoc(userDocRef, {
      isApproved: true,
      approvedBy,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Set custom claims for JWT token (enables role-based auth without DB reads)
    try {
      const response = await fetch('/api/auth/set-custom-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, role: userRole }),
      });
      
      if (response.ok) {
        console.log(`✅ Custom claims set for user ${uid} with role: ${userRole}`);
      } else {
        console.error('Failed to set custom claims:', await response.text());
      }
    } catch (claimsError) {
      console.error('Error setting custom claims:', claimsError);
      // Don't throw - approval should succeed even if claims fail
    }
    
    // Also update team document if it exists (teams use snake_case is_approved)
    try {
      await fetch('/api/admin/approve-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, approvedBy }),
      });
      console.log(`✅ Updated team approval status via API for uid: ${uid}`);
    } catch (teamError) {
      console.error('Error updating team approval:', teamError);
      // Don't throw - approval should succeed even if team update fails
    }
  } catch (error: any) {
    console.error('Error approving user:', error);
    throw new Error(error.message || 'Failed to approve user');
  }
};

// Reject/decline user registration (Super Admin only)
export const rejectUser = async (uid: string): Promise<void> => {
  try {
    // Instead of deleting, we could mark as rejected
    // For now, we'll delete the user account
    await deleteUser(uid);
  } catch (error: any) {
    console.error('Error rejecting user:', error);
    throw new Error(error.message || 'Failed to reject user');
  }
};
