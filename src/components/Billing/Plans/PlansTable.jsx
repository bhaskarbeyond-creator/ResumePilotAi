import React, { Component } from 'react';
import Checkimage from '../../../assets/check.png';
import { withTranslation } from 'react-i18next';
class PlansTable extends Component {
    constructor(props) {
        super(props);
    }

 

    render() {
        const { t } = this.props;

        return (
            <>
                <div className="custom-page__Plans-heading">
                    <h1>{t('billing.title')}</h1>
                    <p>{t('billing.subtitle')}</p>
                </div>
                <div className="custom-page__Plans-body">
                    {/* Card */}
                    <div className="custom-page__Plans-card">
                        <div className="custom-page__Plans-cardHead">
                            {/* Card Head */}
                            <div className="price">
                                <span className="currency">{this.props.currency}</span>
                                <span className="custom-page__Plans-price">
                                    {this.props.monthly !== null &&
                                        this.props.monthly.toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    /<span className="monthLabel">{t('billing.plans.perMonth')}</span>
                                </span>
                            </div>
                            {/* Name */}
                            <div className="planName">
                                <span>{t('billing.plans.monthly')}</span>
                                <span>
                                    Pay {this.props.currency}
                                    {this.props.monthly} for 1 month
                                </span>
                            </div>
                        </div>
                        {/* Card Body  */}
                        <div className="planCard__body">
                            <ul>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.unlimitedPDF')}</div>
                                    </div>
                                </li>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.unlimitedResumes')}</div>
                                    </div>
                                </li>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.nonRecurring')}</div>
                                    </div>
                                </li>
                            </ul>
                            <div onClick={() => this.props.nextStep('monthly')} className="planCard-paymentBtnBasic">
                                {t('billing.plans.selectPlan')}
                            </div>
                        </div>
                    </div>
                    {/* Card */}
                    <div className="custom-page__Plans-card custom-page__Plans-card-active  ">
                        <div className="custom-page__Plans-cardHead">
                            {/* Card Head */}
                            <div className="price">
                                <span className="currency">{this.props.currency}</span>
                                <span className="custom-page__Plans-price">
                                    {(this.props.quartarly / 6).toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                    /<span className="monthLabel">{t('billing.plans.perMonth')}</span>
                                </span>
                            </div>
                            {/* Name */}
                            <div className="planName">
                                <span>{t('billing.plans.quarterly')}</span>
                                <span>
                                    Pay {this.props.currency}
                                    {this.props.quartarly} for 6 months
                                </span>
                            </div>
                        </div>
                        {/* Card Body  */}
                        <div className="planCard__body">
                            <ul>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.unlimitedPDF')}</div>
                                    </div>
                                </li>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.unlimitedResumes')}</div>
                                    </div>
                                </li>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.nonRecurring')}</div>
                                    </div>
                                </li>
                            </ul>
                            <div onClick={() => this.props.nextStep('halfYear')} className="planCard-paymentBtnBasic planCard-paymentBtnBasic-active">
                                {t('billing.plans.selectPlan')}
                            </div>
                        </div>
                    </div>
                    {/* Card */}
                    <div className="custom-page__Plans-card">
                        <div className="custom-page__Plans-cardHead">
                            {/* Card Head */}
                            <div className="price">
                                <span className="currency">{this.props.currency}</span>
                                <span className="custom-page__Plans-price">
                                    {(this.props.yearly / 12).toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                    /<span className="monthLabel">{t('billing.plans.perMonth')}</span>
                                </span>
                            </div>
                            {/* Name */}
                            <div className="planName">
                                <span>{t('billing.plans.yearly')}</span>
                                <span>
                                    {' '}
                                    {this.props.currency}
                                    {this.props.yearly} for 1 Year
                                </span>
                            </div>
                        </div>
                        {/* Card Body  */}
                        <div className="planCard__body">
                            <ul>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.unlimitedPDF')}</div>
                                    </div>
                                </li>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.unlimitedResumes')}</div>
                                    </div>
                                </li>
                                {/* feature item */}
                                <li className="planCard__featureItem">
                                    <div className="leftside">
                                        <img src={Checkimage} alt="check" />
                                    </div>
                                    <div className="rightside">
                                        <div>{t('billing.plans.nonRecurring')}</div>
                                    </div>
                                </li>
                            </ul>
                            <div onClick={() => this.props.nextStep('yearly')} className="planCard-paymentBtnBasic">
                                {t('billing.plans.selectPlan')}
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }
}
const MyComponent = withTranslation('common')(PlansTable);
export default MyComponent;
