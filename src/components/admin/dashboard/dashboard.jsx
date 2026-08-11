import React, { Component } from 'react';
import { getStats, getAllSubscriptions, getEarnings } from '../../../firestore/dbOperations';
import { Navigate } from 'react-router-dom';

// React Icons
import {
  FaDollarSign,
  FaUsers,
  FaFileAlt,
  FaDownload,
  FaChartBar,
  FaCalendarAlt,
  FaExclamationTriangle
} from 'react-icons/fa';

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            numberOfUsers: 0,
            numberOfResumes: 0,
            numberOfDownloads: 0,
            earnings: 0,
            users: [],
            userEditOpen: false,
            redirectToUser: false,
            clickedUser: null,
            clickedUserEmail: null,
            clickedUserMembership: null,
            clickedUserMembershipEnd: null,
            //
            subscriptions: null,
            rows: null,
        };
        this.users = [{ type: 'premium' }, { type: 'free' }, { type: 'free' }, { type: 'premium' }, { type: 'premium' }, { type: 'premium' }, { type: 'premium' }];
        this.returnUsers = this.returnUsers.bind(this);
    }
    componentDidMount() {
        getStats().then((value) => {
            this.setState({
                numberOfUsers: value !== undefined ? value.numberOfUsers : 0,
                numberOfResumes: value !== undefined ? value.numberOfResumesCreated : 0,
                numberOfDownloads: value !== undefined ? value.numberOfResumesDownloaded : 0,
            });
        });
        getAllSubscriptions().then((element) => {
            var subscriptionsRows = [];
            if (!element) {
                this.setState({
                    subscriptions: false,
                });
            } else {
                // Found subscriptions and we need to add them to row state to display it
                element.forEach((sub) => {
                    console.log(sub);
                    subscriptionsRows.push(this.createData(sub.userId, sub.type, sub.sbsEnd.toDate().toDateString(), sub.paimentType));
                });
            }
            this.setState({ rows: subscriptionsRows });
        });
        getEarnings().then((value) => {
            if (value != null) {
                this.setState({ earnings: value.amount });
            } else {
                // no earnings object found
            }
        });
    }
    returnUsers() {
        if (this.state.subscriptions == false) {
            return (
                <div className="bg-white rounded-lg border border-slate-200 p-8">
                    <div className="text-center">
                        <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 mb-4">
                            <FaExclamationTriangle className="w-6 h-6 text-slate-400" />
                        </div>
                        <h3 className="text-sm font-medium text-slate-900 mb-1">No Active Subscriptions</h3>
                        <p className="text-xs text-slate-500">No subscription data available at this time.</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">User</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Plan</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Expires</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Payment</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {this.state.rows &&
                                this.state.rows.map((row, index) => (
                                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center">
                                                    <span className="text-xs font-medium text-slate-600">
                                                        {row.id.substring(0, 2).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 font-mono">
                                                        {row.id.length > 8 ? `${row.id.substring(0, 8)}...` : row.id}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                                row.subscription === 'premium' 
                                                    ? 'bg-violet-100 text-violet-700' 
                                                    : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {row.subscription === 'premium' && <span className="w-1.5 h-1.5 bg-violet-400 rounded-full mr-1.5"></span>}
                                                {row.subscription}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center text-sm text-slate-600">
                                                <FaCalendarAlt className="w-3 h-3 mr-2 text-slate-400" />
                                                <span className="text-xs">{row.expiration}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs text-slate-600 capitalize font-medium">{row.type}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                                Active
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
    createData(id, email, subscription, type) {
        return { id, email, subscription, type };
    }
    render() {
        return (
            <div className="min-h-screen bg-slate-50 px-4 py-6">
                {this.state.redirectToUser == true && (
                    <Navigate
                        to="/adm/user/ss"
                        state={{
                            userId: this.state.clickedUser,
                            email: this.state.clickedUserEmail,
                            membership: this.state.clickedUserMembership,
                            membershipEnd: this.state.clickedUserMembershipEnd,
                        }}
                        replace
                    />
                )}
                
                {/* Compact Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
                            <div className="flex items-center mt-1 text-sm text-slate-500">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse"></div>
                                <span>Live metrics</span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                            {new Date().toLocaleDateString()}
                        </div>
                    </div>
                </div>

                {/* Compact Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* Earnings */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                                <FaDollarSign className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                +12%
                            </span>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">${this.state.earnings}</p>
                            <p className="text-xs text-slate-500 mt-1">Total Earnings</p>
                        </div>
                    </div>

                    {/* Users */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                                <FaUsers className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                +5%
                            </span>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{this.state.numberOfUsers}</p>
                            <p className="text-xs text-slate-500 mt-1">Total Users</p>
                        </div>
                    </div>

                    {/* Resumes */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 bg-violet-500 rounded-lg flex items-center justify-center">
                                <FaFileAlt className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-full">
                                +8%
                            </span>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{this.state.numberOfResumes}</p>
                            <p className="text-xs text-slate-500 mt-1">Resumes Created</p>
                        </div>
                    </div>

                    {/* Downloads */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                <FaDownload className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                                +15%
                            </span>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{this.state.numberOfDownloads}</p>
                            <p className="text-xs text-slate-500 mt-1">Downloads</p>
                        </div>
                    </div>
                </div>

                {/* Subscriptions Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-800">Recent Subscriptions</h2>
                        <button className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                            View All
                        </button>
                    </div>
                    {this.returnUsers()}
                </div>
            </div>
        );
    }
}
export default Dashboard;
