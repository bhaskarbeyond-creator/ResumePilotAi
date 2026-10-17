import React from 'react';

const CoverCard = ({ children, className = '' }) => (
    <div className={`card bs-card-executive ${className}`}>{children}</div>
);

export default CoverCard;
