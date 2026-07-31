import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const nationality = searchParams.get('nationality') || '';

    if (!name) {
      return NextResponse.json({ success: false, error: 'Name parameter is required' }, { status: 400 });
    }

    console.log(`[Real World Checker] Checking status for: ${name} (${nationality})`);

    // Step 1: Search Wikipedia for the player
    const searchQuery = `${name} ${nationality} footballer`.trim();
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(searchQuery)}&utf8=1`;
    
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'eSportsLeagueManager/1.0 (contact@example.com)' }
    });
    
    const searchData = await searchRes.json();
    let searchResults = searchData?.query?.search || [];

    if (searchResults.length === 0 && nationality) {
      console.log(`[Real World Checker] No match with nationality. Retrying with name only: ${name} footballer`);
      const fallbackQuery = `${name} footballer`.trim();
      const fallbackUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(fallbackQuery)}&utf8=1`;
      
      try {
        const fallbackRes = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'eSportsLeagueManager/1.0 (contact@example.com)' }
        });
        const fallbackData = await fallbackRes.json();
        searchResults = fallbackData?.query?.search || [];
      } catch (err) {
        console.error('Fallback search failed:', err);
      }
    }

    if (searchResults.length === 0) {
      return NextResponse.json({ 
        success: true, 
        retired: null, 
        summary: 'No matches found on Wikipedia to verify real-world status.' 
      });
    }

    // Take the best matching title
    const bestTitle = searchResults[0].title;
    
    // Step 2: Fetch summary extract for this title
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle.replace(/ /g, '_'))}`;
    const summaryRes = await fetch(summaryUrl, {
      headers: { 'User-Agent': 'eSportsLeagueManager/1.0 (contact@example.com)' }
    });

    if (!summaryRes.ok) {
      return NextResponse.json({ 
        success: true, 
        retired: null, 
        summary: `Found Wikipedia article "${bestTitle}" but failed to extract summary.` 
      });
    }

    const summaryData = await summaryRes.json();
    const extract = summaryData.extract || '';

    if (!extract) {
      return NextResponse.json({ 
        success: true, 
        retired: null, 
        summary: `No text summary available for "${bestTitle}".` 
      });
    }

    // Step 3: Parse summary for retirement indicators
    const extractLower = extract.toLowerCase();
    
    const retiredKeywords = [
      'former professional', 
      'former footballer', 
      'retired professional', 
      'retired footballer', 
      'ex-footballer',
      'previously played',
      'career ended',
      'is a former',
      'retired from professional',
      'announced his retirement',
      'announced their retirement'
    ];

    const activeKeywords = [
      'plays as', 
      'currently plays', 
      'is a professional footballer who plays',
      'playing as',
      'is an active'
    ];

    let retired = false;
    let confidence = 'medium';

    // Simple heuristic parser
    const hasRetiredIndicator = retiredKeywords.some(keyword => extractLower.includes(keyword));
    const hasActiveIndicator = activeKeywords.some(keyword => extractLower.includes(keyword));

    if (hasRetiredIndicator && !hasActiveIndicator) {
      retired = true;
      confidence = 'high';
    } else if (hasActiveIndicator && !hasRetiredIndicator) {
      retired = false;
      confidence = 'high';
    } else if (hasRetiredIndicator && hasActiveIndicator) {
      // Mixed - might be retired internationally but active in club
      retired = extractLower.indexOf('former') < extractLower.indexOf('plays') ? true : false;
      confidence = 'medium';
    } else {
      // Default to checking past tense verbs near starting sentence
      const firstSentence = extract.split('.')[0] || '';
      const hasPlayed = /\b(played|represented|retired)\b/i.test(firstSentence);
      const hasPlays = /\b(plays|representing|active)\b/i.test(firstSentence);
      
      if (hasPlayed && !hasPlays) {
        retired = true;
      } else {
        retired = false;
      }
      confidence = 'low';
    }

    return NextResponse.json({
      success: true,
      retired,
      confidence,
      title: bestTitle,
      summary: extract,
      url: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${bestTitle.replace(/ /g, '_')}`
    });

  } catch (error: any) {
    console.error('Error verifying real-world player status:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
