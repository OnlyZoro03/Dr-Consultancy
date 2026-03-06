import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';

/* Soft medical-blue palette per bar */
const COLORS = ['#3b82f6', '#0d9488', '#6366f1', '#f59e0b', '#10b981', '#ef4444'];

/**
 * DepartmentChart - Bar chart showing per-department patient load.
 *
 * Props:
 *  data - Array of { department: string, count: number }
 */
const DepartmentChart = ({ data = [] }) => {
    return (
        <div className="chart-card">
            <div className="chart-card-header">
                <h2 className="chart-card-title">Department Load</h2>
                <span className="chart-card-badge">Today</span>
            </div>

            <ResponsiveContainer width="100%" height={280}>
                <BarChart
                    data={data}
                    margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                    barSize={38}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                        dataKey="department"
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        label={{ value: 'Patients', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                        cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                        formatter={(value) => [`${value} patients`, 'Count']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default DepartmentChart;
