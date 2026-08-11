import React from 'react';
import LoaderAnimation from '../../assets/animations/lottie-loader.json';
import { useLottie } from 'lottie-react';
import './spinner.scss'
const SpinnerView = () => {
    const loaderOptions = {
        loop: true,
        autoplay: true,
        animationData: LoaderAnimation,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice',
        },
    };
    const { View } = useLottie(loaderOptions);
    return View;
};

const Spinner = () => {

    return (
        <div className="loading">
            {/* <Lottie options={loaderOptions}
          height={190}
          width={400} /> */}
            <div className='spinner'>
                <SpinnerView />
            </div>
        </div>
    );
};

export default Spinner;


