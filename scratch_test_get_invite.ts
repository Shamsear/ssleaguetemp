import { GET } from '@/app/api/invites/[code]/route';
import { NextRequest } from 'next/server';

async function testGet() {
  const req = new NextRequest('http://localhost:3000/api/invites/T789-MJLK-HGG6');
  const res = await GET(req, { params: Promise.resolve({ code: 'T789-MJLK-HGG6' }) });
  const data = await res.json();
  console.log('GET /api/invites/T789-MJLK-HGG6 result:');
  console.log(data);
}

testGet().catch(console.error);
