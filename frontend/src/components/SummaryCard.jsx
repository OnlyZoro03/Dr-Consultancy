import React from 'react';

/**
 * SummaryCard - A reusable stat card for the Doctor Dashboard.
 *
 * Props:
 *  title  - Card heading text
 *  value  - Numeric or string value to display
 *  icon   - React element (e.g. from react-icons)
 *  color  - Tailwind background class  (e.g. "bg-blue-500")
 *  subtext - Optional small note under the value
 */
const SummaryCard = ({ title, value, icon, color = 'bg-blue-500', subtext }) => {
    return (
        <div className="summary-card">
            {/* Left: coloured icon block */}
            <div className={`summary-card-icon ${color}`}>
                {icon}
            </div>

            {/* Right: text block */}
            <div className="summary-card-body">
                <p className="summary-card-title">{title}</p>
                <p className="summary-card-value">{value !== undefined && value !== null ? value : '—'}</p>
                {subtext && <p className="summary-card-subtext">{subtext}</p>}
            </div>
        </div>
    );
};

export default SummaryCard;
