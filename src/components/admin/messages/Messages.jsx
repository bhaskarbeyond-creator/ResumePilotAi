import React, { Component } from 'react';
import { getAllMessages } from '../../../firestore/dbOperations';
import { FaEnvelope, FaUser, FaCalendar, FaEye, FaChevronDown, FaChevronUp, FaClock, FaInbox, FaSearch, FaFilter } from 'react-icons/fa';

class Messages extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedRow: null,
            rows: null,
        };
        this.createData = this.createData.bind(this);
    }
    // Return  Object with the data
    createData(contact, email, date, more, message, name) {
        return { contact, email, date, more, message, name };
    }
    componentDidMount() {
        getAllMessages().then((data) => {
            console.log(data);
            if (data == null) {
                console.log('contacts is empty');
            } else {
                var dataToShow = [];
                data.forEach((element) => {
                    dataToShow.push(
                        this.createData(
                            'imgHere',
                            element.email,
                            new Date(element.created_at.seconds * 1000).toLocaleDateString('en'),
                            <button className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 transition-colors">
                                <FaEye className="w-3 h-3" />
                                <span className="text-xs font-medium">View</span>
                            </button>,
                            element.message,
                            element.name
                        )
                    );
                });
                this.setState({ rows: dataToShow });
            }
        });
    }
    render() {
        const messageCount = this.state.rows ? this.state.rows.length : 0;
        
        return (
            <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
                {/* Header Section */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <FaInbox className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Messages & Contacts</h1>
                            <p className="text-sm text-slate-500">Manage customer messages and contact requests</p>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaEnvelope className="w-4 h-4 text-slate-600" />
                                <span className="text-sm text-slate-600">Total Messages</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">{messageCount}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaClock className="w-4 h-4 text-slate-600" />
                                <span className="text-sm text-slate-600">Today</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">
                                {this.state.rows ? 
                                    this.state.rows.filter(row => 
                                        new Date(row.date).toDateString() === new Date().toDateString()
                                    ).length : 0
                                }
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                                <FaUser className="w-4 h-4 text-slate-600" />
                                <span className="text-sm text-slate-600">Contacts</span>
                            </div>
                            <p className="text-lg font-semibold text-slate-900">{messageCount}</p>
                        </div>
                    </div>
                </div>

                {/* Messages Table Section */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Customer Messages</h3>
                                <p className="text-sm text-slate-500">All contact form submissions and customer inquiries</p>
                            </div>
                            {messageCount > 0 && (
                                <div className="flex items-center space-x-3">
                                    <button className="flex items-center space-x-2 text-slate-600 hover:text-slate-800 transition-colors">
                                        <FaSearch className="w-4 h-4" />
                                        <span className="text-sm">Search</span>
                                    </button>
                                    <button className="flex items-center space-x-2 text-slate-600 hover:text-slate-800 transition-colors">
                                        <FaFilter className="w-4 h-4" />
                                        <span className="text-sm">Filter</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {this.state.rows == null || this.state.rows.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FaInbox className="w-8 h-8 text-slate-400" />
                            </div>
                            <h4 className="text-lg font-medium text-slate-900 mb-2">No Messages Yet</h4>
                            <p className="text-sm text-slate-500">Customer messages will appear here once they contact you</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                            <div className="flex items-center space-x-1">
                                                <FaUser className="w-3 h-3" />
                                                <span>Contact</span>
                                            </div>
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                            <div className="flex items-center space-x-1">
                                                <FaEnvelope className="w-3 h-3" />
                                                <span>Email</span>
                                            </div>
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                            <div className="flex items-center justify-center space-x-1">
                                                <FaCalendar className="w-3 h-3" />
                                                <span>Date</span>
                                            </div>
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {this.state.rows.map((row, index) => (
                                        <React.Fragment key={index}>
                                            <tr className="hover:bg-slate-50 transition-colors duration-150">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                                            {row.name !== undefined && row.name.substr(0, 1).toUpperCase()}
                                                        </div>
                                                        <div className="ml-3">
                                                            <div className="text-sm font-medium text-slate-900">
                                                                {row.name || 'Anonymous'}
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                {this.state.selectedRow === index ? 'Message expanded' : 'Click to view message'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-slate-900">{row.email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <div className="flex items-center justify-center space-x-1">
                                                        <FaClock className="w-3 h-3 text-slate-400" />
                                                        <span className="text-sm text-slate-600">{row.date}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <div className="flex items-center justify-center space-x-2">
                                                        <button
                                                            onClick={() => {
                                                                this.setState({ 
                                                                    selectedRow: this.state.selectedRow === index ? null : index 
                                                                });
                                                            }}
                                                            className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                                        >
                                                            {this.state.selectedRow === index ? (
                                                                <>
                                                                    <FaChevronUp className="w-3 h-3" />
                                                                    <span>Hide</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <FaEye className="w-3 h-3" />
                                                                    <span>View</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {/* Collapsible Message Row */}
                                            {this.state.selectedRow === index && (
                                                <tr className="bg-blue-50">
                                                    <td colSpan="4" className="px-6 py-4">
                                                        <div className="animate-fadeIn">
                                                            <div className="bg-white border border-blue-200 rounded-lg p-4">
                                                                <div className="flex items-center space-x-2 mb-3">
                                                                    <FaEnvelope className="w-4 h-4 text-blue-600" />
                                                                    <h4 className="text-sm font-semibold text-slate-900">Message Content</h4>
                                                                </div>
                                                                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                                        {row.message || 'No message content available.'}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
                                                                    <div className="flex items-center space-x-4 text-xs text-slate-500">
                                                                        <div className="flex items-center space-x-1">
                                                                            <FaUser className="w-3 h-3" />
                                                                            <span>{row.name}</span>
                                                                        </div>
                                                                        <div className="flex items-center space-x-1">
                                                                            <FaEnvelope className="w-3 h-3" />
                                                                            <span>{row.email}</span>
                                                                        </div>
                                                                        <div className="flex items-center space-x-1">
                                                                            <FaCalendar className="w-3 h-3" />
                                                                            <span>{row.date}</span>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => this.setState({ selectedRow: null })}
                                                                        className="flex items-center space-x-1 text-slate-600 hover:text-slate-800 transition-colors"
                                                                    >
                                                                        <FaChevronUp className="w-3 h-3" />
                                                                        <span className="text-xs">Close</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
export default Messages;
