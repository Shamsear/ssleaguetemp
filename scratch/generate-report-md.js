const fs = require('fs');
const path = require('path');

function generateReport() {
  const jsonPath = path.join('C:', 'Users', 'shams', '.gemini', 'antigravity', 'brain', '0ba56b80-6007-4099-a1c0-498e1fba37a8', 'audit_report.json');
  const reportData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  let md = `# Database Alignment Discrepancy Report (S16 & S17)\n\n`;
  md += `This report lists all discrepancies between auction allocation wins, active team rosters (\`team_players\`), and contract histories (\`player_history\`).\n\n`;
  
  md += `## Summary Statistics\n`;
  md += `- **Total Winning Allocations Checked**: ${reportData.summary.totalWins}\n`;
  md += `- **Active Roster Records Found**: ${reportData.summary.rosters}\n`;
  md += `- **Contract History Records Found**: ${reportData.summary.histories}\n`;
  md += `- **Roster & History Mismatches**: ${reportData.summary.mismatchesCount}\n`;
  md += `- **Missing History Records (No contract timeline)**: ${reportData.summary.missingHistoryCount}\n`;
  md += `- **Missing Roster Records (Won bid but not on squad list)**: ${reportData.summary.missingRosterCount}\n\n`;

  md += `## 1. Roster and History Mismatches (${reportData.mismatches.length})\n`;
  md += `The table below lists cases where a player's actual team roster or history start does not match the winning bid team.\n\n`;
  md += `| Player ID | Player Name | Season | Round Type | expected (Bid Win) | Actual (Roster/History) | Issue Details |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  
  reportData.mismatches.forEach(m => {
    md += `| ${m.player_id} | ${m.player_name} | ${m.season_id} | ${m.round_type} | ${m.expected_team_name || m.expected_team_id} | ${m.actual_team_id} | ${m.details} |\n`;
  });

  md += `\n## 2. Missing History Timelines (${reportData.missingHistory.length})\n`;
  md += `These players won their bids but have no contract timeline records in \`player_history\`.\n\n`;
  md += `| Player ID | Player Name | Season | Round Type | Winning Team | Price |\n`;
  md += `|---|---|---|---|---|---|\n`;
  
  reportData.missingHistory.forEach(h => {
    md += `| ${h.player_id} | ${h.player_name} | ${h.season_id} | ${h.round_type} | ${h.expected_team_name || h.expected_team_id} | ${h.price || '—'} |\n`;
  });

  md += `\n## 3. Missing Roster Allocations (${reportData.missingRoster.length})\n`;
  md += `These players won their bids but are not in the \`team_players\` roster list.\n\n`;
  md += `| Player ID | Player Name | Season | Round Type | Winning Team | Price |\n`;
  md += `|---|---|---|---|---|---|\n`;
  
  reportData.missingRoster.forEach(r => {
    md += `| ${r.player_id} | ${r.player_name} | ${r.season_id} | ${r.round_type} | ${r.expected_team_name || r.expected_team_id} | ${r.price || '—'} |\n`;
  });

  const outputPath = path.join('C:', 'Users', 'shams', '.gemini', 'antigravity', 'brain', '0ba56b80-6007-4099-a1c0-498e1fba37a8', 'discrepancy_report.md');
  fs.writeFileSync(outputPath, md, 'utf-8');
  console.log(`Markdown report saved to: ${outputPath}`);
}

generateReport();
