import "./LeaderboardTable.css";
import { Fragment } from "react";

function SortIndicator({ active, direction }) {
  if (!active) {
    return <span className="sort-indicator" aria-hidden="true">↕</span>;
  }
  return <span className="sort-indicator active" aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>;
}

export default function LeaderboardTable({
  columns,
  rows,
  rowKey,
  emptyMessage,
  sortBy,
  sortDir,
  onSort,
  rowClassName,
  expandedRowIds,
  renderExpandedRow,
  onRowClick,
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const expandedIds = expandedRowIds || new Set();

  return (
    <div className="leaderboard-table-wrap">
      <table className="leaderboard-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sortBy === column.sortKey;
              return (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={column.align ? `align-${column.align}` : ""}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() => onSort(column.sortKey)}
                    >
                      {column.label}
                      <SortIndicator active={active} direction={sortDir} />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {!hasRows ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = row[rowKey];
              const expanded = expandedIds.has(String(key));
              const clickable = typeof onRowClick === "function";
              return (
                <Fragment key={`row-group-${key}`}>
                  <tr
                    className={`${rowClassName ? rowClassName(row) : ""} ${clickable ? "clickable-row" : ""}`.trim()}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    onKeyDown={clickable ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    } : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-expanded={clickable && renderExpandedRow ? (expanded ? "true" : "false") : undefined}
                  >
                    {columns.map((column) => (
                      <td key={`${key}-${column.key}`} className={column.align ? `align-${column.align}` : ""}>
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>

                  {renderExpandedRow ? (
                    <tr className={`expanded-row ${expanded ? "open" : "collapsed"}`}>
                      <td colSpan={columns.length}>
                        <div className={`expanded-row-content ${expanded ? "open" : "collapsed"}`}>
                          {renderExpandedRow(row, expanded)}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
