import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatDayLabel(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDayTooltip(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProfileVotesChart({ series }) {
  const labels = series?.labels || [];
  const totalData = series?.data || [];
  const voteData = series?.vote_data || [];
  const faceoffData = series?.faceoff_data || [];

  const chartData = useMemo(() => {
    return labels.map((label, index) => ({
      label,
      votes: Number(voteData[index] || 0),
      faceoffVotes: Number(faceoffData[index] || 0),
      totalVotes: Number(totalData[index] || (Number(voteData[index] || 0) + Number(faceoffData[index] || 0))),
    }));
  }, [faceoffData, labels, totalData, voteData]);

  return (
    <section className="profile-section card profile-votes-card">
      <h2>Votes Over Time</h2>
      <p className="profile-section-subtitle">Daily volume for album/song votes and Face-Off votes across the last 60 days.</p>
      <div className="profile-chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
            <defs>
              <linearGradient id="totalVotesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgba(29,185,84,0.45)" />
                <stop offset="95%" stopColor="rgba(29,185,84,0.05)" />
              </linearGradient>
              <linearGradient id="faceoffVotesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgba(70,180,255,0.4)" />
                <stop offset="95%" stopColor="rgba(70,180,255,0.05)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.55} />
            <XAxis
              dataKey="label"
              tickFormatter={formatDayLabel}
              minTickGap={32}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border-color)" }}
              tickLine={{ stroke: "var(--border-color)" }}
            />
            <YAxis
              allowDecimals={false}
              width={34}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border-color)" }}
              tickLine={{ stroke: "var(--border-color)" }}
            />
            <Tooltip
              labelFormatter={formatDayTooltip}
              contentStyle={{
                border: "1px solid var(--border-color)",
                background: "var(--card-bg)",
                borderRadius: "10px",
                color: "var(--text)",
              }}
              formatter={(value, name) => {
                const labelsMap = {
                  totalVotes: "Total Votes",
                  votes: "Album/Song Votes",
                  faceoffVotes: "Face-Off Votes",
                };
                return [value, labelsMap[name] || name];
              }}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconSize={10}
              height={22}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="totalVotes"
              name="Total Votes"
              stroke="rgb(29,185,84)"
              fill="url(#totalVotesGradient)"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="faceoffVotes"
              name="Face-Off Votes"
              stroke="rgb(70,180,255)"
              fill="url(#faceoffVotesGradient)"
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}