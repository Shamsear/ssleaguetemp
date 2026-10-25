import { validateAdminInvite } from '@/lib/firebase/invites';

async function testValidate() {
  try {
    const res = await validateAdminInvite('T789-MJLK-HGG6');
    console.log('validateAdminInvite result:', res);
  } catch (err) {
    console.error('validateAdminInvite threw:', err);
  }
}

testValidate().catch(console.error);
