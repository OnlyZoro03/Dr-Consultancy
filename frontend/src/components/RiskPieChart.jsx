import React from 'react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

/* Risk levels colour map */
const RISK_COLORS = {
    Low: '#22c55e',     // green
    Medium: '#f59e0b',  // amber
    High: '#ef4444',    // red
};

const FALLBACK_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

/**
 * Custom label rendered inside / outside each slice showing percentage.
 */
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null; // skip tiny slices
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

/**
 * RiskPieChart - Pie chart showing risk distribution of today's patients.
 *
 * Props:
 *  data - Array of { risk: string, value: number }
 */
const RiskPieChart = ({ data = [] }) => {
    return (
        <div className="chart-card">
            <div className="chart-card-header">
                <h2 className="chart-card-title">Risk Distribution</h2>
                <span className="chart-card-badge">Today</span>
            </div>

            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="risk"
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        labelLine={false}
                        label={renderCustomLabel}
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={RISK_COLORS[entry.risk] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                        formatter={(value, name) => [`${value} patients`, name]}
                    />
                    <Legend
                        iconType="circle"
                        iconSize={10}
                        formatter={(value) => <span style={{ color: '#475569', fontSize: 13 }}>{value} Risk</span>}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default RiskPieChart;
