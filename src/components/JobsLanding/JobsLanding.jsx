import React, { useState, useContext } from 'react';
import { AuthContext } from '../../main';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import GridBackground from '../Dashboard2/elements/GridBackground';
import JobsLandingHero from './JobsLandingHero';
import LandingJobTopCompanies from './LandingJobTopCompanies';
import LandingJobsProcess from './LandingJobsProcess';
import LandingJobsFeatured from './LandingJobsFeatured';
import LandingJobsCategories from './LandingJobsCategories';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';
import { motion, AnimatePresence } from 'framer-motion';
import fire from '../../conf/fire';

const JobsLanding = () => {
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY;
    const user = useContext(AuthContext);
    const [showAuthModal, setShowAuthModal] = useState(false);


    const handleAuthButtonClick = () => {
        setShowAuthModal(!showAuthModal);
    };

    const closeAuthModal = () => {
        setShowAuthModal(false);
    };

    const handleLogout = () => {
        fire.auth().signOut().then(() => {
            console.log('User signed out successfully');
        }).catch((error) => {
            console.error('Error signing out:', error);
        });
    };
    
    return (
        <div className="jobs-landing-wrapper relative min-h-screen h-full w-full">
            <GridBackground className="z-0" />
            <div className="relative z-10 bg-transparent h-full w-full">
                <HomepageNavbar 
                    authBtnHandler={handleAuthButtonClick}
                    user={user}
                    logout={handleLogout}
                />
                <JobsLandingHero 
                    authBtnHandler={handleAuthButtonClick}
                    user={user}
                />
                <LandingJobTopCompanies />
                <LandingJobsProcess />
                <LandingJobsFeatured />
                {/* <LandingJobsCategories /> */}
                <HomepageFooter />
            </div>
            
            {/* Auth Modal with framer-motion animation */}
            <AnimatePresence>
                {showAuthModal && (
                    <motion.div 
                        className="wrapper"
                        style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.7)'
                        }}
                
                    >
                        <AuthWrapper closeModal={closeAuthModal} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default JobsLanding;
