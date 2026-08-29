import React from 'react';

import HomepageNavbar from './elements/HomepageNavbar';
import HomepageHero from './elements/HomepageHero';
import HomepageTrustedBy from './elements/HomepageTrustedBy';
import HomepageSteps from './elements/HomepageSteps';
import HomepageReviews from './elements/HomepageReviews';
import HomepagePricing from './elements/HomepagePricing';
import Homepagefaqs from './elements/Homepagefaqs';
import HomepageFooter from './elements/HomepageFooter';
import GridBackground from './elements/GridBackground';

class MyPageComponent extends React.Component {
    render() {
        const { authBtnHandler, user, logout } = this.props;

        return (
            <div className="relative min-h-screen h-full w-full">
                <GridBackground className="z-0" />
                <div className="relative z-10 bg-transparent h-full w-full">
                    <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
                    <HomepageHero />
                    <HomepageTrustedBy />
                    <HomepageSteps />
                    <HomepageReviews />
                    <HomepagePricing />
                    <Homepagefaqs />
                    <HomepageFooter />
                </div>
            </div>
        );
    }
}

export default MyPageComponent;
