import { NextResponse } from 'next/server';
import { triggerNews } from '@/lib/news/trigger';
import { testGeminiConnection } from '@/lib/gemini/config';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Not Found' }, { status: 404 });
  }
  try {
    console.log('🧪 Testing news generation system...');
    
    // Step 1: Test Gemini connection
    console.log('📡 Testing Gemini API connection...');
    const geminiWorks = await testGeminiConnection();
    
    if (!geminiWorks) {
      return NextResponse.json({
        success: false,
        error: 'Gemini API connection failed',
        details: 'Check if GEMINI_API_KEY is set in .env.local',
      }, { status: 500 });
    }
    
    console.log('✅ Gemini API connected successfully');
    
    // Step 2: Test simple news generation
    console.log('📰 Testing news generation...');
    await triggerNews('team_registered', {
      season_id: 'TEST_SEASON',
      season_name: 'Test Season',
      team_name: 'Test Thunder FC',
      total_teams: 1,
      is_returning: false,
    });
    
    return NextResponse.json({
      success: true,
      message: 'News generation test completed! Check console for detailed logs.',
      gemini_connected: true,
      news_triggered: true,
    });
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Test failed',
      stack: error.stack,
    }, { status: 500 });
  }
}
