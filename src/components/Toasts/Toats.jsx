import React, { Component } from 'react';
import './Toasts.scss';
import successAnimation from '../../assets/animations/lottie-success.json';
import deleteAnimation from '../../assets/animations/lottie-delete.json';
import errorAnimation from '../../assets/animations/lottie-error.json';
import downloadAnimation from '../../assets/animations/lottie-download.json';
import { useLottie } from 'lottie-react';

import loadingLoader from '../../assets/animations/315-loader-ring.json';

const SuccessView = () => {
    const successOptions = {
        loop: true,
        autoplay: true,
        animationData: loadingLoader,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice',
        },
    };
    const { View } = useLottie(successOptions);
    return View;
};

const ErrorView = () => {
    const errorOptions = {
        loop: true,
        autoplay: true,
        animationData: errorAnimation,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice',
        },
    };
    const { View } = useLottie(errorOptions);
    return View;
};

class Toasts extends Component {
    render() {
        const deleteOptions = {
            loop: true,
            autoplay: true,
            animationData: deleteAnimation,
            rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
            },
        };
        const errorOptions = {
            loop: true,
            autoplay: true,
            animationData: errorAnimation,
            rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
            },
        };
        const downloadOptions = {
            loop: true,
            autoplay: true,
            animationData: downloadAnimation,
            rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
            },
        };
        return (
            <div className="toast success">
                <div className="iconAnimation">
                    {/* <Lottie options={this.props.type == "Success" ? successOptions : this.props.type == "Name Changed" ? successOptions : this.props.type == "Password Changed" ? successOptions : this.props.type == "Delete" ? deleteOptions : this.props.type == "Error" ? errorOptions : this.props.type == "Download" ? downloadOptions : this.props.type == "SuccessEmail" && successOptions}
                        height={this.props.type == "Delete" ? 70 : 50}
                        width={this.props.type == "Delete" ? 70 : 50} /> */}
                    {this.props.type == 'Success' ? <SuccessView /> : <></>}
                    {this.props.type == 'Download' ? <SuccessView /> : <></>}
                    {this.props.type == 'Upgrade' ? <SuccessView /> : <></>}
                    {this.props.type == 'Error' ? <ErrorView /> : <></>}
                </div>
                <div className="toastDetails">
                    <span className="toastTitle">
                        {this.props.type == 'Success'
                            ? 'Success'
                            : this.props.type == 'Delete'
                            ? 'Deleted'
                            : this.props.type == 'Error'
                            ? 'Error'
                            : this.props.type == 'Download'
                            ? 'Downloading'
                            : this.props.type == 'Upgrade'
                            ? 'Premium Required'
                            : this.props.type == 'SuccessEmail' && 'Email Sent'}
                    </span>
                    <span className="toastMessage">
                        {this.props.message ||
                            (this.props.type == 'Success'
                                ? 'Operation completed successfully.'
                                : this.props.type == 'Password Changed'
                                ? 'Your password has been changed'
                                : this.props.type == 'Name Changed'
                                ? 'Your personal Info has been changed.'
                                : this.props.type == 'Delete'
                                ? 'Item has been removed successfully.'
                                : this.props.type == 'Error'
                                ? 'An error occurred. Please try again.'
                                : this.props.type == 'Download'
                                ? 'Your download is being prepared.'
                                : this.props.type == 'Upgrade'
                                ? 'You need a Premium subscription to access this feature.'
                                : this.props.type == 'SuccessEmail' && 'An email has been sent successfully.')}{' '}
                    </span>
                </div>
            </div>
        );
    }
}
export default Toasts;
