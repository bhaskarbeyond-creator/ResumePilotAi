import React, { Component } from 'react'
import './Settings.scss'
import Input from '../../Form/simple-input/SimpleInput'
import { addUser, changePassword, getWebsiteDetails, editPersonalInfo } from '../../../firestore/dbOperations'
import { motion, AnimatePresence } from 'framer-motion'
import Toasts from '../../Toasts/Toats'
import { withTranslation } from 'react-i18next';
import BasicPlanImage from '../../../assets/pen.png'
import { FaUser, FaLock, FaShieldAlt, FaCrown, FaCheck, FaChevronRight, FaBell, FaGlobe, FaUserShield, FaUserCog } from 'react-icons/fa'

class Settings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            firstname: "",
            lastname: "",
            newPassword: "",
            websiteName: "",
            websiteDescription: "",
            facebook: "",
            pinterest: "",
            instagram: "",
            twitter: "",
            youtube: "",
            isPersonalSuccessToastShowed: false,
            isPasswordChangedToastShowed: false,
            activeTab: 'profile'
        }
 
        this.handleInputs = this.handleInputs.bind(this);
        this.personalInfoFormHandler = this.personalInfoFormHandler.bind(this);
        this.handleChangePassword = this.handleChangePassword.bind(this);
        this.setActiveTab = this.setActiveTab.bind(this);
    }
    componentDidMount() {
        getWebsiteDetails().then((value) => {
            value !== null && this.setState({
                websiteName: value.websiteName,
                websiteDescription: value.websitedescription
            })
        });
    }

    // Set active tab
    setActiveTab(tab) {
        this.setState({ activeTab: tab });
    }

    // Edit personal INfo 

     editPersonalInfo(event,userId,firstname,lastname){
         event.preventDefault()
         editPersonalInfo(userId,firstname,lastname)
     }
    // Receiving data from inputs   
    handleInputs(title, value) {
        switch (title) {
            case "First name":
                this.setState({ firstname: value })
                break;
            case "Last name":
                this.setState({ lastname: value })
                break;
            case "New Password":
                this.setState({ newPassword: value })
                break;
            default:
                break;
        }
    }

    
    // handle Personal Info from submit
    personalInfoFormHandler(event) {
        event.preventDefault();
        if (this.state.firstname != "" && this.state.lastname != "") {
            addUser(this.props.uid, this.state.firstname, this.state.lastname)
            this.setState({ isPersonalSuccessToastShowed: true });
            setTimeout(() => {
                document.location.reload();
            }, 2000);
        }
    }

    

    // handle Password change
    handleChangePassword(event) {
        event.preventDefault();
        if (this.state.newPassword.length > 5) {
            changePassword(this.state.newPassword);
            this.setState({ isPasswordChangedToastShowed: true })
            setTimeout(() => {
                this.setState({ isPasswordChangedToastShowed: false })
            }, 2000);
        } else {
            alert("Password must contain 6 or more letters")
        }
    }

    render() {
        const { t } = this.props;
        const { activeTab } = this.state;
        
        return (
            <div className="settings-dashboard">
                {/* Toast Notifications */}
                <AnimatePresence>
                    {this.state.isPersonalSuccessToastShowed && (
                        <motion.div
                            className="toast-container"
                            initial={{ opacity: 0, y: -50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                        >
                            <Toasts type="Name Changed" />
                        </motion.div>
                    )}
                </AnimatePresence>
                <AnimatePresence>
                    {this.state.isPasswordChangedToastShowed && (
                        <motion.div
                            className="toast-container"
                            initial={{ opacity: 0, y: -50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                        >
                            <Toasts type="Password Changed" />
                        </motion.div>
                    )}
                </AnimatePresence>
                
                {/* Header Section */}
                <div className="settings-header">
                    <div className="settings-header-content">
                        <h1>{t("dashboard.settings")}</h1>
                        <p>Manage your account settings and preferences</p>
                    </div>
                </div>
                
                {/* Main Content */}
                <div className="settings-container">
                    {/* Sidebar Navigation */}
                    <div className="settings-sidebar">
                        <div className="profile-card">
                            <div className="profile-avatar">
                                <span>{this.props.firstname ? this.props.firstname.charAt(0) : "U"}{this.props.lastname ? this.props.lastname.charAt(0) : ""}</span>
                            </div>
                            <div className="profile-info">
                                <h3>{this.props.firstname || "User"} {this.props.lastname || ""}</h3>
                                <span className={`membership-badge ${this.props.membership === "Premium" ? "premium" : "basic"}`}>
                                    {this.props.membership} Plan
                                </span>
                            </div>
                        </div>
                        
                        <nav className="settings-nav">
                            <button 
                                className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                                onClick={() => this.setActiveTab('profile')}
                            >
                                <FaUser className="nav-icon" />
                                <span>{t("dashboard.personalInfo") || "Profile"}</span>
                            </button>
                            
                            <button 
                                className={`nav-item ${activeTab === 'security' ? 'active' : ''}`}
                                onClick={() => this.setActiveTab('security')}
                            >
                                <FaLock className="nav-icon" />
                                <span>{t("dashboard.changePassword") || "Security"}</span>
                            </button>
                            
                            <button 
                                className={`nav-item ${activeTab === 'plan' ? 'active' : ''}`}
                                onClick={() => this.setActiveTab('plan')}
                            >
                                <FaShieldAlt className="nav-icon" />
                                <span>{t("dashboard.yourPlan") || "Your Plan"}</span>
                            </button>
                        </nav>
                    </div>
                    
                    {/* Main Content Area */}
                    <div className="settings-content">
                        {/* Profile Tab */}
                        {activeTab === 'profile' && this.props.role !== "admin" && (
                            <motion.div 
                                className="settings-panel"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="panel-header">
                                    <h2><FaUserCog className="panel-icon" /> {t("dashboard.personalInfo") || "Profile Information"}</h2>
                                    <p>Update your personal information</p>
                                </div>
                                
                                <div className="panel-content">
                                    <form>
                                        <div className="input-grid">
                                            <Input 
                                                placeholder={this.props.firstname || t("dashboard.firstnamePlaceholder") || "First name"} 
                                                name={t("dashboard.firstname")}  
                                                handleInputs={this.handleInputs} 
                                                title={t("dashboard.firstname")} 
                                            />
                                            <Input 
                                                placeholder={this.props.lastname || t("dashboard.lastnamePlaceholder") || "Last name"} 
                                                name={t("dashboard.lastname")}  
                                                handleInputs={this.handleInputs} 
                                                title={t("dashboard.lastname")} 
                                            />
                                        </div>
                                        <div className="form-actions">
                                            <button 
                                                className="btn-save"
                                                onClick={(event) => this.editPersonalInfo(event, this.props.uid, this.state.firstname, this.state.lastname)}
                                            >
                                                <FaCheck className="btn-icon" />
                                                {t("dashboard.save") || "Save Changes"}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </motion.div>
                        )}
                        
                        {/* Security Tab */}
                        {activeTab === 'security' && (
                            <motion.div 
                                className="settings-panel"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="panel-header">
                                    <h2><FaUserShield className="panel-icon" /> {t("dashboard.changePassword") || "Security Settings"}</h2>
                                    <p>Manage your account security</p>
                                </div>
                                
                                <div className="panel-content">
                                    <form onSubmit={this.handleChangePassword}>
                                        <Input 
                                            type="Password" 
                                            name="New Password" 
                                            handleInputs={this.handleInputs} 
                                            title={t("dashboard.newPassword") || "New Password"} 
                                            placeholder={t("dashboard.newPasswordPlaceholder") || "Enter new password (min 6 characters)"} 
                                        />
                                        <div className="form-actions">
                                            <button type="submit" className="btn-save">
                                                <FaCheck className="btn-icon" />
                                                {t("dashboard.save") || "Update Password"}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </motion.div>
                        )}
                        
                        {/* Plan Tab */}
                        {activeTab === 'plan' && (
                            <motion.div 
                                className="settings-panel"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="panel-header">
                                    <h2><FaCrown className="panel-icon" /> {t("dashboard.yourPlan") || "Your Subscription"}</h2>
                                    <p>Manage your subscription plan</p>
                                </div>
                                
                                <div className="panel-content">
                                    <div className="plan-card">
                                        <div className="plan-icon">
                                            <img src={BasicPlanImage} alt="Plan icon" />
                                        </div>
                                        
                                        <div className="plan-details">
                                            <div className="plan-header">
                                                <h3 className={this.props.membership === "Premium" ? "premium-plan" : "basic-plan"}>
                                                    {this.props.membership} Plan
                                                    {this.props.membership === "Premium" && <FaCheck className="check-icon" />}
                                                </h3>
                                                <span className="plan-status">Active</span>
                                            </div>
                                            
                                            <p className="plan-description">
                                                {this.props.membership === "Premium" 
                                                    ? "You have access to all premium features and priority support." 
                                                    : "Your account is under the free plan with access to basic features."}
                                            </p>
                                            
                                            <div className="plan-features">
                                                <div className="feature-item">
                                                    <FaCheck className="feature-icon" />
                                                    <span>Resume Builder</span>
                                                </div>
                                                <div className="feature-item">
                                                    <FaCheck className="feature-icon" />
                                                    <span>PDF Export</span>
                                                </div>
                                                {this.props.membership === "Premium" && (
                                                    <>
                                                        <div className="feature-item">
                                                            <FaCheck className="feature-icon" />
                                                            <span>AI Resume Enhancement</span>
                                                        </div>
                                                        <div className="feature-item">
                                                            <FaCheck className="feature-icon" />
                                                            <span>Premium Templates</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            
                                            {this.props.membership === "Basic" && (
                                                <div className="plan-actions">
                                                    <a href="/billing/plans" className="btn-upgrade">
                                                        Upgrade to Premium
                                                        <FaChevronRight className="arrow-icon" />
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Settings)
export default MyComponent;

