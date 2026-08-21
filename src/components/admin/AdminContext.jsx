import React, { createContext, useContext } from 'react';

const AdminContext = createContext({
  isSuperAdmin: false,
  userEmail: '',
  uid: '',
  hasMfa: false,
});

export function AdminProvider({ value, children }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminSession() {
  return useContext(AdminContext);
}

export default AdminContext;
