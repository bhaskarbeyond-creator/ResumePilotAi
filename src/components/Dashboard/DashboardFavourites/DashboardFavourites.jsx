import React from 'react';
import './DashboardFavourites.scss';
import { AiFillDelete } from 'react-icons/ai';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getCoverById, getFavourites, getResumeById } from '../../../firestore/dbOperations';
import { AiFillStar } from 'react-icons/ai';
import { FaTrash } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';

import { AiOutlineExclamationCircle } from 'react-icons/ai';
function DashboardFavourites(props) {
    // ids
    const [favourites, setFavourites] = React.useState([]);
    // favourites content
    const [favouritesContent, setFavouritesContent] = React.useState([]);

    // log hello when this component is mounted
    useEffect(() => {
        if (props.isFavoritesShowed) {
            console.log('fetch Favourites');
        }

        // clear favourites
        setFavourites([]);
        setFavouritesContent([]);

        getFavourites(localStorage.getItem('user')).then((data) => {
            if (data.length > 0) {
                setFavourites(data);
                // for each id in data get the data from firebase`
                data.forEach((id) => {
                    if (id !== undefined) {
                        if (id.length > 9) {
                            getCoverById(localStorage.getItem('user'), id).then((data) => {
                                if (data !== null) setFavouritesContent((prev) => [...prev, data]);
                            });
                        } else if (id.length <= 9) {
                            getResumeById(localStorage.getItem('user'), id).then((data) => {
                                if (data !== null) setFavouritesContent((prev) => [...prev, data]);
                            });
                        }
                    }
                });
            }
        });

        // add event listener to handle click outside of modal
        document.addEventListener('click', handleClickOutside);
        // remove event listener when component is unmounted
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [props.isFavoritesShowed]);

    // handle click outside of modal to close it
    const handleClickOutside = (e) => {
        if (e.target.classList.contains('dashboard-favourites')) {
            props.showFavorites();
        }
    };

    // a resume doesnt contain a property named comapny name
    // the cover letter does

    const typeFinder = (favourite) => {
        if (favourite.companyName !== undefined) {
            return 'Cover Letter';
        } else {
            return 'Resume';
        }
    };

    //return the summary of the favourite

    const summaryFinder = (favourite) => {
        if (favourite.companyName !== undefined) {
            if (favourite.components.length > 0) {
                // we find a component with type Paragraph
                const paragraph = favourite.components.find((component) => component.type === 'Paragraph');
                if (paragraph !== undefined) {
                    //return only the first 100 characters
                    // make sure the paragraph has at least 100 characters
                    if (paragraph.content.length > 100) {
                        return paragraph.content.substring(0, 100);
                    } else {
                        return paragraph.content;
                    }
                } else {
                    return 'No Summary';
                }
            }
        } else {
            //return only the first 100 characters
            // make sure the paragraph has at least 100 characters
            if (favourite.summary.length > 100) {
                return favourite.summary.substring(0, 100);
            }
            return favourite.summary;
        }
    };

    // handle favourites return jsx
    const handleFavourites = () => {
        if (favouritesContent.length > 0) {
            return favouritesContent.map((favourite) => {
                console.log(favourite);
                return (
                    <div className="dashboard-favourites-modal-body-content-item">
                        <div className="favourites-item-icon">
                            <AiFillStar className="favourites-item-icon-svg" />
                        </div>

                        <div className="favourites-item-name">
                            <div className="favourites-item-head">{t('dashNew.fullName')}</div>
                            <div className="favourites-item-body">
                                {favourite.firstname} {favourite.lastname}
                            </div>
                        </div>

                        <div className="favourites-item-type">
                            {' '}
                            <div className="favourites-item-head">{t('dashNew.type')}</div>
                            <div className="favourites-item-body">{typeFinder(favourite)}</div>
                        </div>
                        <div className="favourites-item-summary">
                            <div className="favourites-item-head">{t('dashNew.summary')}</div>
                            <div className="favourites-item-body-summary">{summaryFinder(favourite)}</div>
                        </div>

                        {/* <div className="favourites-item-delete">
                        <div className="favourites-item-head">Action</div>
                            <div  className="favourites-item-body favourites-item-delete-custom">
                                <FaTrash onClick={()=>props.removeFavorite(favourite.id)} className="favourites-item-body-svg" />
                                Delete</div>
                        </div> */}
                    </div>
                );
            });
        } else {
            return (
                <div className="favorites-empty">
                    <AiOutlineExclamationCircle className="empty-icon" />
                    <p className="empty-text">{t('dashNew.noFavouritesFound')}</p>
                </div>
            );
        }
    };
    const { t } = props;

    return (
        <AnimatePresence>
            {props.isFavoritesShowed === true && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="dashboard-favourites">
                    <motion.div initial={{ opacity: 0, translateY: -100 }} animate={{ opacity: 1, translateY: 0 }} transition={{ delay: 0.3, duration: 0.2 }} className="dashboard-favourites-modal">
                        <div className="dashboard-favourites-modal-header">
                            <h2>{t('dashNew.favourites')}</h2>
                            <p>{t('dashNew.favouitesDesc')}</p>
                        </div>
                        <div className="dashboard-favourites-modal-body">
                            <div className="dashboard-favourites-modal-body-content">{handleFavourites()}</div>
                        </div>
                        <div className="dashboard-favourites-modal-footer">
                            <button
                                onClick={(event) => {
                                    props.showFavorites();
                                }}>
                                {t('dashNew.close')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const MyComponent = withTranslation('common')(DashboardFavourites);
export default MyComponent;
