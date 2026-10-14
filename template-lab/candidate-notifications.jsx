// DEV-ONLY component harness. HTTP responses are controlled by the browser test;
// this is not a candidate authentication or production data path.
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/tailwind.css';
import '../src/index.css';
import DashboardNotifications from '../src/components/Dashboard/DashboardNotifications/DashboardNotifications';

window.notificationToasts = [];
export function Lab() {
    const [visible, setVisible] = useState(true);
    return <MemoryRouter>
        <button type="button" onClick={() => setVisible(value => !value)}>Toggle test mount</button>
        {visible && <DashboardNotifications showToast={(...args) => window.notificationToasts.push(args)} />}
    </MemoryRouter>;
}
const strict = new URLSearchParams(location.search).has('strict');
createRoot(document.getElementById('root')).render(strict ? <StrictMode><Lab /></StrictMode> : <Lab />);
