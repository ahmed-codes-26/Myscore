/**
 * CSV Export Utility for MyScore
 * Exports match scorecards and player career statistics to clean CSV format.
 * Includes UTF-8 BOM so Microsoft Excel and Google Sheets render characters cleanly.
 */

function downloadCSV(csvContent, fileName) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

function row(...cols) {
  return cols.map(escapeCSV).join(',') + '\r\n';
}

/**
 * Exports complete match scorecard to CSV.
 */
export function exportMatchScorecardCSV(match, inn1State, inn2State, players = []) {
  const getPlayerName = (id) => {
    const p = players.find(x => x._id === id);
    return p ? p.name : (id || 'Unknown');
  };

  let csv = '';

  // Match Header
  csv += row('MyScore - Match Scorecard');
  csv += row('Match', `${match.team1?.name || 'Team 1'} vs ${match.team2?.name || 'Team 2'}`);
  csv += row('Date', match.createdAt ? new Date(match.createdAt).toLocaleDateString() : 'N/A');
  csv += row('Status', match.status || 'N/A');
  csv += row('Result', match.result?.summary || 'In Progress');
  csv += row('Rules', `Overs: ${match.rules?.oversTotal || 0}, Last-Man-Batting: ${match.rules?.lastManBatting ? 'Yes' : 'No'}, Max/Bowler: ${match.rules?.maxOversPerBowler || 0}`);
  csv += row('');

  const appendInnings = (innNumber, teamName, state) => {
    if (!state) return;
    csv += row(`INNINGS ${innNumber}: ${teamName}`);
    csv += row('Score', `${state.runs}/${state.wickets} in ${state.oversText} ov`);
    csv += row('Extras', `Total: ${state.extras?.total || 0} (W: ${state.extras?.wides || 0}, NB: ${state.extras?.noBalls || 0}, B: ${state.extras?.byes || 0}, LB: ${state.extras?.legByes || 0})`);
    csv += row('');

    // Batting Table
    csv += row('BATTING', 'Status', 'R', 'B', '4s', '6s', 'SR');
    const batsmen = Object.values(state.batting || {});
    for (const b of batsmen) {
      csv += row(
        getPlayerName(b.playerId),
        b.dismissal?.how || (b.isOut ? 'Out' : 'Not Out'),
        b.runs,
        b.balls,
        b.fours,
        b.sixes,
        b.strikeRate
      );
    }
    csv += row('');

    // Bowling Table
    csv += row('BOWLING', 'O', 'M', 'R', 'W', 'Econ', 'Wides', 'NoBalls');
    const bowlers = Object.values(state.bowling || {});
    for (const bo of bowlers) {
      csv += row(
        getPlayerName(bo.playerId),
        bo.oversText,
        bo.maidens,
        bo.runs,
        bo.wickets,
        bo.economy,
        bo.wides,
        bo.noBalls
      );
    }
    csv += row('');

    // Fall of Wickets
    if (state.fallOfWickets && state.fallOfWickets.length > 0) {
      csv += row('FALL OF WICKETS', 'Score', 'Over', 'Dismissed Player');
      state.fallOfWickets.forEach((fow, idx) => {
        csv += row(`Wicket ${idx + 1}`, `${fow.runs}/${fow.wicketNumber}`, fow.over, getPlayerName(fow.playerId));
      });
      csv += row('');
    }
    csv += row('----------------------------------------------------');
  };

  const team1BatsFirst = match.battingFirstTeamKey === 'team1';
  const inn1Name = team1BatsFirst ? match.team1?.name : match.team2?.name;
  const inn2Name = team1BatsFirst ? match.team2?.name : match.team1?.name;

  appendInnings(1, inn1Name, inn1State);
  if (inn2State) {
    appendInnings(2, inn2Name, inn2State);
  }

  const cleanName = `${match.team1?.name || 'T1'}_vs_${match.team2?.name || 'T2'}_Scorecard.csv`.replace(/\s+/g, '_');
  downloadCSV(csv, cleanName);
}

/**
 * Exports complete player career stats and match log to CSV.
 */
export function exportPlayerStatsCSV(player, stats) {
  if (!player || !stats) return;

  const { batting = {}, bowling = {}, matchLogs = [] } = stats;
  let csv = '';

  // Player Header
  csv += row('MyScore - Player Career Profile');
  csv += row('Name', player.name);
  csv += row('Role', player.role || 'Player');
  csv += row('Type', player.isGuest ? 'Guest' : 'Permanent');
  csv += row('Total Matches', stats.totalMatches || 0);
  csv += row('');

  // Batting Career
  csv += row('CAREER BATTING');
  csv += row('Innings', batting.innings || 0);
  csv += row('Runs', batting.runs || 0);
  csv += row('Balls Faced', batting.balls || 0);
  csv += row('Highest Score', batting.highestScore || 0);
  csv += row('Average', batting.average || '0.00');
  csv += row('Strike Rate', batting.strikeRate || '0.00');
  csv += row('Fours (4s)', batting.fours || 0);
  csv += row('Sixes (6s)', batting.sixes || 0);
  csv += row('');

  // Bowling Career
  csv += row('CAREER BOWLING');
  csv += row('Innings', bowling.innings || 0);
  csv += row('Overs Thrown', bowling.oversText || '0.0');
  csv += row('Wickets', bowling.wickets || 0);
  csv += row('Runs Conceded', bowling.runs || 0);
  csv += row('Best Bowling', bowling.bestFigures || '-');
  csv += row('Economy Rate', bowling.economy || '0.00');
  csv += row('Average', bowling.average || '0.00');
  csv += row('Maidens', bowling.maidens || 0);
  csv += row('');

  // Match-by-Match Logs
  csv += row('MATCH LOGS');
  csv += row('Date', 'Opponent', 'Result', 'Batting (R/B)', '4s', '6s', 'SR', 'Bowling (O-M-R-W)', 'Econ');
  for (const m of matchLogs) {
    const batRuns = m.batting?.batted ? `${m.batting.runs} (${m.batting.balls})` : 'DNB';
    const fours = m.batting?.batted ? m.batting.fours : '-';
    const sixes = m.batting?.batted ? m.batting.sixes : '-';
    const sr = m.batting?.batted ? m.batting.strikeRate : '-';

    const bowlFig = m.bowling?.bowled
      ? `${m.bowling.oversText}-${m.bowling.maidens}-${m.bowling.runs}-${m.bowling.wickets}`
      : 'DNB';
    const econ = m.bowling?.bowled ? m.bowling.economy : '-';

    csv += row(
      m.date ? new Date(m.date).toLocaleDateString() : 'N/A',
      m.opponent || 'N/A',
      m.result || 'N/A',
      batRuns,
      fours,
      sixes,
      sr,
      bowlFig,
      econ
    );
  }

  const cleanName = `${player.name}_Career_Stats.csv`.replace(/\s+/g, '_');
  downloadCSV(csv, cleanName);
}
