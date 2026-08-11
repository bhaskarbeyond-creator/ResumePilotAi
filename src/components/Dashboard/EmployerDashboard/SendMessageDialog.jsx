
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPaperPlane, FaTimes } from 'react-icons/fa';
import { createConversation, sendMessage, findExistingConversation } from '../../../firestore/dbOperations';
import fire from '../../../conf/fire';

const SendMessageDialog = ({ isOpen, onClose, applicantId, applicantName, showToast }) => {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim() || isSending) return;

        setIsSending(true);
        try {
            const currentUser = fire.auth().currentUser;
            if (!currentUser) {
                throw new Error('You must be logged in to send messages.');
            }
            const employerId = currentUser.uid;

            // 1. Check if conversation already exists
            const participantIds = [employerId, applicantId];
            console.log('🔍 Looking for existing conversation between:', participantIds);
            let conversationId = await findExistingConversation(participantIds);
            console.log('🔍 Found existing conversation ID:', conversationId);
            
            if (!conversationId) {
                console.log('✨ No existing conversation found, creating new one');
                // Create new conversation if none exists
                const participants = {
                    [employerId]: true,
                    [applicantId]: true,
                };
                const convResult = await createConversation(participants);
                
                if (!convResult.success) {
                    throw new Error(convResult.error || 'Failed to create conversation.');
                }
                
                conversationId = convResult.conversationId;
                console.log('✨ Created new conversation with ID:', conversationId);
            } else {
                console.log('♻️ Using existing conversation:', conversationId);
            }
            
            // 2. Send the message to existing or new conversation
            const messageResult = await sendMessage(conversationId, employerId, message.trim());

            if (!messageResult.success) {
                throw new Error(messageResult.error || 'Failed to send message.');
            }
            
            showToast('success', 'Message Sent!', `Your message to ${applicantName} has been sent.`);
            setMessage('');
            onClose();

        } catch (error) {
            console.error('Error sending initial message:', error);
            showToast('error', 'Error', error.message || 'Could not send the message.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-[10002]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="bg-white rounded-lg shadow-xl p-4 w-full max-w-md"
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold text-slate-800">Send Message to {applicantName}</h3>
                            <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
                                <FaTimes className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <form onSubmit={handleSendMessage}>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Type your message..."
                                className="w-full h-24 p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                disabled={isSending}
                            />
                            <div className="flex justify-end mt-3">
                                <button 
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 flex items-center"
                                    disabled={!message.trim() || isSending}
                                >
                                    <FaPaperPlane className="w-3 h-3 mr-2" />
                                    {isSending ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SendMessageDialog;

