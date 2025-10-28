const SUMMARY_COLUMNS = [
  'SUMMARY',
  'FUNCTIONS',
  'ORDER_OF_OPERATIONS',
  'DEPENDENCIES',
  'DATA FLOW / STATE MANAGEMENT',
  'INPUT SOURCES / OUTPUT DESTINATIONS',
  'SIDE EFFECTS',
];

export default {
  id: 'row-summary',
  description: 'Default traverser that produces a multi-column snapshot for the current row.',
  matches() {
    return true;
  },
  run(context) {
    const { row, getPath, getValue } = context;
    const pathLabel = getPath(row);
    const lines = [];
    lines.push(`Row summary for ${pathLabel}`);
    SUMMARY_COLUMNS.forEach((header) => {
      const value = (getValue(row, header) ?? '').trim();
      if (!value) {
        return;
      }
      const label = header.toLowerCase();
      const safeValue = value.length > 200 ? `${value.slice(0, 197)}...` : value;
      lines.push(`- ${label}: ${safeValue}`);
    });
    if (lines.length === 1) {
      lines.push('- No diagnostic data has been recorded for this row yet.');
    }
    lines.push('');
    lines.push('Tip: add a JSON query such as {"type":"linkage","target":"n44"} to Column Q for deeper traversal.');
    return lines.join('\n');
  },
};
