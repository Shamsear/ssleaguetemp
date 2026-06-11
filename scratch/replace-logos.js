const fs = require('fs');
const glob = require('glob');

const files = [
  'app/api/team/all/route.ts',
  'app/api/team/[teamId]/route.ts',
  'app/api/fantasy/leaderboard/[leagueId]/route.ts',
  'app/api/fantasy/teams/my-team/route.ts',
  'app/api/committee/player-stats-by-round/route.ts',
  'app/api/teams/[id]/all-seasons/route.ts',
  'app/api/teams/[id]/details/route.ts',
  'app/api/teams/[id]/statistics/route.ts',
  'app/api/teams/route.ts',
  'app/api/seasons/[id]/stats/route.ts',
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Replace various fallback chains with just checking logo_url (and sometimes team_logo if it's on team data)
  // We'll just replace the specific lines found earlier.
  
  // app/api/team/all/route.ts & app/api/team/[teamId]/route.ts
  content = content.replace(/const logoUrl = teamInfo\?\.logoUrl \|\| teamInfo\?\.logoURL \|\| teamInfo\?\.logo_url \|\| teamSeasonData\?\.team_logo \|\| null;/g, 'const logoUrl = teamInfo?.logo_url || null;');
  
  // app/api/team/all/route.ts (console.log)
  content = content.replace(/\| Logo:', \n.*info\?\.logoUrl \|\| info\?\.logoURL \|\| info\?\.logo_url/g, "| Logo:', info?.logo_url");
  content = content.replace(/info\?\.logoUrl \|\| info\?\.logoURL \|\| info\?\.logo_url/g, "info?.logo_url");
  
  // app/api/fantasy/leaderboard/[leagueId]/route.ts
  content = content.replace(/const logoUrl = teamData\?\.logo_url \|\| teamData\?\.logoUrl \|\| teamData\?\.team_logo \|\| null;/g, 'const logoUrl = teamData?.logo_url || null;');
  
  // app/api/fantasy/teams/my-team/route.ts
  content = content.replace(/teamLogo = firebaseTeamData\?\.logo_url \|\| \n.*firebaseTeamData\?\.logoUrl \|\| firebaseTeamData\?\.team_logo \|\| null;/g, 'teamLogo = firebaseTeamData?.logo_url || null;');
  content = content.replace(/firebaseTeamData\?\.logo_url \|\| firebaseTeamData\?\.logoUrl \|\| firebaseTeamData\?\.team_logo/g, 'firebaseTeamData?.logo_url');
  
  // app/api/committee/player-stats-by-round/route.ts
  content = content.replace(/const logoUrl = data\.logo_url \|\| data\.team_logo \|\| \n.*data\.logoUrl \|\| null;/g, 'const logoUrl = data.logo_url || null;');
  content = content.replace(/data\.logo_url \|\| data\.team_logo \|\| data\.logoUrl/g, 'data.logo_url');
  content = content.replace(/has_logo_url: !!data\.logo_url,\n\s*has_logoUrl: !!data\.logoUrl/g, 'has_logo_url: !!data.logo_url');
  
  // app/api/teams/[id]/all-seasons/route.ts
  content = content.replace(/logoUrl = userDoc\.data\(\)\?\.logoUrl \|\| null;/g, ''); 
  // wait, in all-seasons, we just fetch teamData?.logo_url, which is fine
  
  // app/api/teams/[id]/details/route.ts
  content = content.replace(/logo_url: teamData\?\.logoUrl \|\| teamData\?\.logoURL \|\| teamData\?\.logo_url \|\| \n.*null,/g, 'logo_url: teamData?.logo_url || null,');
  content = content.replace(/teamData\?\.logoUrl \|\| teamData\?\.logoURL \|\| teamData\?\.logo_url/g, 'teamData?.logo_url');
  
  // app/api/teams/[id]/statistics/route.ts
  content = content.replace(/team_logo: teamData\.logo_url \|\| teamData\.team_logo \|\| \n.*teamData\.logoUrl \|\| null,/g, 'team_logo: teamData.logo_url || null,');
  content = content.replace(/teamData\.logo_url \|\| teamData\.team_logo \|\| teamData\.logoUrl/g, 'teamData.logo_url');
  
  // app/api/teams/route.ts
  // it uses `if (teamData.logo_url) { logoUrlMap.set(id, teamData.logo_url); }` which is already fine!
  
  // app/api/seasons/[id]/stats/route.ts
  content = content.replace(/logo_url: data\.logoUrl \|\| data\.logoURL \|\| data\.logo_url \|\| null/g, 'logo_url: data.logo_url || null');

  fs.writeFileSync(file, content, 'utf8');
  console.log('Updated ' + file);
});
