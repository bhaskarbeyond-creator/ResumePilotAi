import React, { Component } from 'react';
import './CustomPage.scss';
import { getPageByName, getPages, getSocialLinks, getWebsiteData } from '../../firestore/dbOperations';
// Images

import { withTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';

class CustomePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pages: [],
            websiteName: '',
            websiteDescription: '',
            pageContent: '',
            socialLinks: null,
            loaded: false,
            currentPage: this.props.custompage,
        };

        // Inisialising proper  style for custom pages
        window.location.pathname.substring(0, 3) == '/p/' && this.customStyles();
    }

    componentDidMount() {
        getPageByName(this.state.currentPage).then((value) => {
            this.setState({ pageContent: value.pagecontent, currentPage: this.props.custompage });
        });
        getPages().then((value) => value !== null && this.setState({ pages: value }));
        getWebsiteData().then((value) => {
            value !== null && this.setState({ websiteName: value.title, websiteDescription: value.description });
        });
        getSocialLinks()
            .then((value) => {
                value !== null && this.setState({ socialLinks: value });
            })
            .then((value) => {
                this.setState({ loaded: true });
            });
    }

    // Giving the proper stylicn for custom pages
    customStyles() {
        document.getElementById('root').style.overflow = 'none';
        document.getElementById('root').style.height = 'unset';
        document.getElementsByTagName('body')[0].style.height = 'fit-content';
        document.getElementsByTagName('body')[0].style.overflow = 'unset';
        document.getElementsByTagName('html')[0].style.height = 'fit-content';
        document.getElementsByTagName('html')[0].style.overflow = 'scroll';
        document.getElementsByTagName('html')[0].style.overflowX = 'hidden';
    }

    render() {
        const { t } = this.props;

        return (
            <>
                {this.state.loaded == true && (
                    <>
                        <div id="customPage" className="custom-page">
                            {/* Navbar */}
                            <HomepageNavbar user={this.props.user} />
                            {/* Page Content */}
                            <div dangerouslySetInnerHTML={{ __html: this.state.pageContent }} className="custom-page__content mt-[100px] w-7xl mx-auto"></div>
                            {/* Page Footer */}
                            <HomepageFooter user={this.props.user} />
                        </div>
                    </>
                )}
            </>
        );
    }
}

// Wrapper component to use useParams hook and pass parameters as props
const CustomePageWrapper = (props) => {
    const { custompage } = useParams();
    return <CustomePage {...props} custompage={custompage} />;
};

const MyComponent = withTranslation('common')(CustomePageWrapper);
export default MyComponent;
