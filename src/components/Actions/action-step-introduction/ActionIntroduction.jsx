import React, { Component } from 'react';
import './ActionIntroduction.scss';
import logo from '../../../assets/logo/logo.png';
import conf from '../../../conf/configuration';
import { Link } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import { getPages } from '../../../firestore/dbOperations';
import TrustPilotImage from '../../../assets/trustpilot.png';
import HeadPNG from '../../../assets/headPNG.png';
import FeaturesPNG from '../../../assets/FeaturesPNG.png';
import GridBackground from '../../Dashboard2/elements/GridBackground';
import Stars from '../../../assets/stars.svg?react';
import { HiMenuAlt2 } from 'react-icons/hi';
import { get3Reviews, getWebsiteData } from '../../../firestore/dbOperations';

class ActionIntroduction extends Component {
    constructor(props) {
        super(props);
        if (document.location.search.substr(0, 7) === '?step=3') {
            this.props.goThirdStep();
        }

        this.state = {
            pages: [],
            isMobileHeadToggle: false,
            reviews: [],
            reviewsNumber: 0,
        };

        window.location.pathname.substring(0, 8) === '/' && this.customStyles();

        this.customStyles = this.customStyles.bind(this);
        this.handleToggleClick = this.handleToggleClick.bind(this);
        this.getData = this.getData.bind(this);
    }
    authVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
    };

    handleToggleClick = () => {
        this.setState({ isMobileHeadToggle: !this.state.isMobileHeadToggle });
    };

    getData() {
        getWebsiteData().then((data) => {
            if (data) {
                this.setState({ reviewsNumber: data.rating });
            }
        });
    }

    customStyles() {
        document.getElementById('root').style.overflow = 'hidden';
        document.getElementById('root').style.height = '100%';
        document.getElementsByTagName('body')[0].style.height = '100%';
        document.getElementsByTagName('body')[0].style.overflow = 'hidden';
        document.getElementsByTagName('html')[0].style.height = '100%';
        document.getElementsByTagName('html')[0].style.overflow = 'hidden';
        document.getElementsByTagName('html')[0].style.overflowX = 'hidden';
    }

    componentDidMount() {
        getPages().then((value) => value !== null && this.setState({ pages: value }));
        get3Reviews().then((value) => value !== null && this.setState({ reviews: value }));
        this.getData();
    }
    render() {
        const { t } = this.props;
        return (
            <div id="homepage" className="action-introWrapper">
                <GridBackground />
                <div className="head">
                    <div className="brand">{conf.brand.useImg === false ? <span>{conf.brand.name}</span> : <img className="logo" src={logo} />}</div>
                    <div className="authentication">
                        {this.props.user !== null ? (
                            <Link style={{ textDecoration: 'none' }} to={{ pathname: './dashboard' }} className="authenticationButton">
                                {' '}
                                {t('selectionAction.account')}
                            </Link>
                        ) : (
                            <a onClick={() => this.props.authBtnHandler()} className="authenticationButton">
                                {' '}
                                {t('intro.login')}{' '}
                            </a>
                        )}
                        {this.props.values.email === conf.adminEmail && (
                            <Link style={{ textDecoration: 'none' }} to={{ pathname: './adm/dashboard' }} className="authenticationButton">
                                {' '}
                                {t('selectionAction.admin')}
                            </Link>
                        )}
                        {/* {this.props.user != null && <a onClick={() => this.props.logout()} className="authenticationButton">Logout</a>} */}
                    </div>
                </div>
                <div className="head-mobile">
                    <div className="brand">{conf.brand.useImg === false ? <span>{conf.brand.name}</span> : <img className="logo" src={logo} />}</div>
                    {this.state.isMobileHeadToggle && (
                        <div className="authentication">
                            {this.props.user !== null ? (
                                <Link style={{ textDecoration: 'none' }} to={{ pathname: './dashboard' }} className="authenticationButton">
                                    {' '}
                                    {t('selectionAction.account')}
                                </Link>
                            ) : (
                                <a onClick={() => this.props.authBtnHandler()} className="authenticationButton">
                                    {' '}
                                    {t('intro.login')}{' '}
                                </a>
                            )}
                            {this.props.values.email === conf.adminEmail && (
                                <Link style={{ textDecoration: 'none' }} to={{ pathname: './adm/dashboard' }} className="authenticationButton">
                                    {' '}
                                    {t('selectionAction.admin')}
                                </Link>
                            )}
                            {/* {this.props.user != null && <a onClick={() => this.props.logout()} className="authenticationButton">Logout</a>} */}
                        </div>
                    )}

                    <HiMenuAlt2 onClick={() => this.handleToggleClick()} className="head-toggle" />
                </div>
                <div className="body action-introBody">
                    <div className="intro-left">
                        {/* <h1>
                            {t('intro.titleLeft')} <span>{t('intro.titleSpan')}</span> {t('intro.titleRight')}
                        </h1>
                        <ul>
                            <li>
                                <div className="numberWrapper numberWrapperGold">
                                    <CrownImage className="crownImage" />
                                </div>
                                <span>Now you can create professional cover letters </span>
                            </li>
                            <li>
                                <div className="numberWrapper"> 1 </div> <span>{t('intro.step1')} </span>
                            </li>
                            <li>
                                <div className="numberWrapper"> 2 </div>
                                <span>{t('intro.step2')} </span>
                            </li>
                            <li>
                                <div className="numberWrapper"> 3 </div>
                                <span> {t('intro.step3')}</span>
                            </li>
                        </ul> */}

                        <div className="intro-head">
                            <h1> {t('homepageText.text1')}</h1>

                            <p>{t('homepageText.text2')}</p>

                            <span className="intro-light-text">Select what do you want to create.</span>
                            <div className="intro-button-selection">
                                <a className="light" onClick={() => this.props.goToResumeSelectionStep()}>
                                    {t('homepageText.text3')}
                                </a>
                                <a
                                    className="dark"
                                    onClick={() => {
                                        this.props.goToCoverSelection();
                                    }}>
                                    {t('homepageText.text4')}{' '}
                                </a>
                            </div>
                        </div>

                        <div className="intro-body">
                            {/*  App image */}
                            <img src={HeadPNG} className="intro-body-head" />

                            {/* Reviews */}
                            <div className="intro-body-reviews-wrapper">
                                <div className="intro-body-reviews">
                                    <h1>{t('homepageText.text5')}</h1>
                                    <div className="intro-body-reviews-list">
                                        <div className="intro-body-reviews-trustpilot">
                                            <span>{this.state.reviewsNumber} out of 5</span>
                                            <Stars />
                                            <img src={TrustPilotImage} alt="" />
                                            <p>Based on 1400 reviews</p>
                                        </div>

                                        {this.state.reviews.map((review, index) => {
                                            return (
                                                <div key={index} className="intro-body-reviews-list-item">
                                                    <img src={review.imageUrl} className="review-image" alt="Image" />
                                                    <span className="review-fullname">{review.name}</span>
                                                    <span className="review-position">{review.occupation}</span>
                                                    <p className="review-text">{review.review}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            {/* Features */}
                            <div className="intro-body-features-wrapper">
                                <div className="intro-body-features">
                                    {/* Left */}
                                    <div className="intro-body-features-left">
                                        <h1>{t('homepageText.text8')}</h1>
                                        <p>{t('homepageText.text9')}</p>
                                    </div>
                                    {/*  right */}
                                    <div className="intro-body-features-right">
                                        <img src={FeaturesPNG} className="features-image" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(ActionIntroduction);
export default MyComponent;
