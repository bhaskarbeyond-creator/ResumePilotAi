/// normal class component with import '../DasboardToast.scss'

import React, { Component } from 'react';
import './DashboardToast.scss';
import { IoMdCheckmark } from 'react-icons/io';
import { AiOutlineExclamationCircle } from 'react-icons/ai';
import { HiOutlineExclamation } from 'react-icons/hi';
import { AnimatePresence, motion } from 'framer-motion';
class DashboardToast extends Component {
    constructor(props) {
        super(props);
        this.state = {
            color: null,
        };
        this.returnSymbol = this.returnSymbol.bind(this);
    }

    returnSymbol() {
        if (this.props.type === 'success') {
            return <IoMdCheckmark className="dashboard-toast-symbol" />;
        } else if (this.props.type === 'error') {
            return <AiOutlineExclamationCircle className="dashboard-toast-symbol" />;
        } else if (this.props.type === 'warning') {
            return <AiOutlineExclamationCircle className="dashboard-toast-symbol" />;
        }
    }

    returnClass() {
        if (this.props.type === 'success') {
            return 'toast-success';
        } else if (this.props.type === 'error') {
            return 'toast-error';
        } else if (this.props.type === 'warning') {
            return 'toast-warning';
        }
    }

    render() {
        return (
            <AnimatePresence>
                {
                    // check if the toast is active and operator

                    this.props.isShowed && (
                        <motion.div initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`dashboard-toast toast-success ${this.returnClass()}`}>
                            {/* Icon  */}
                            <div className="dashboard-toast-icon">
                                <div className="dashboard-toast-bar"></div>
                                <div className="dashboard-toast-circle">{this.returnSymbol()}</div>
                            </div>
                            {/* content  : title message*/}
                            <div className="dashboard-toast-content">
                                <div className="dashboard-toast-content-title">{this.props.title}</div>
                                <div className="dashboard-toast-content-message">{this.props.text}</div>
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence>
        );
    }
}
export default DashboardToast;
