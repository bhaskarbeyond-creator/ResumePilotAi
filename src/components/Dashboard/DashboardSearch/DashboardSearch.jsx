import React, { Component } from 'react';
import './DashboardSearch.scss';
import { ReactComponent as SearchIcon } from '../../../assets/search.svg';
import { ReactComponent as FilterIcon } from '../../../assets/filter.svg';
import { AiOutlineLoading } from 'react-icons/ai';
import { withTranslation } from 'react-i18next';

class DashboardSearch extends Component {
    constructor(props) {
        super(props);
        this.state = {
            search: '',
            filterDropShow: false,
            resume: true,
            coverLetter: true,
            isLoading: false,
            searchTimeout: null,
        };

        this.searchInputRef = React.createRef();
        this.dropdownRef = React.createRef();

        // Bind methods
        this.handleSearch = this.handleSearch.bind(this);
        this.handleFilterDrop = this.handleFilterDrop.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.clearAllFilters = this.clearAllFilters.bind(this);
    }

    handleSearch = (event) => {
        const searchValue = event.target.value;
        this.setState({
            search: searchValue,
            isLoading: true,
        });

        // Clear existing timeout
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
        }

        // Set new timeout
        const timeout = setTimeout(() => {
            this.props.searchDocuments(searchValue);
            this.setState({ isLoading: false });
        }, 500); // Reduced from 1500ms to 500ms for better responsiveness

        this.setState({ searchTimeout: timeout });
    };

    handleFilterDrop = (event) => {
        event.preventDefault();
        this.setState((prevState) => ({
            filterDropShow: !prevState.filterDropShow,
        }));
    };

    handleCheckBox = (event) => {
        const { name, checked } = event.target;
        this.setState({ [name]: checked }, () => {
            this.props.setFilters({ [name]: checked });
        });
    };

    handleClickOutside = (event) => {
        if (this.dropdownRef.current && !this.dropdownRef.current.contains(event.target)) {
            this.setState({ filterDropShow: false });
        }
    };

    clearAllFilters = () => {
        this.setState(
            {
                resume: false,
                coverLetter: false,
            },
            () => {
                this.props.setFilters({
                    resume: false,
                    coverLetter: false,
                });
            }
        );
    };

    componentDidMount() {
        document.addEventListener('mousedown', this.handleClickOutside);
        // Focus search input on mount
        if (this.searchInputRef.current) {
            this.searchInputRef.current.focus();
        }
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickOutside);
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
        }
    }

    render() {
        const { t } = this.props;
        const { search, filterDropShow, resume, coverLetter, isLoading } = this.state;

        return (
            <>
                <div className="dashboard-search">
                    <div className="dashboard-search-group">
                        {isLoading ? <AiOutlineLoading className="dashboard-search-loading" /> : <SearchIcon className="dashboard-search-icon" />}

                        <input
                            ref={this.searchInputRef}
                            className="dashboard-search-input"
                            type="text"
                            placeholder={t('dashNew.searchDocuments')}
                            value={search}
                            onChange={this.handleSearch}
                            aria-label="Search documents"
                        />

                        <button className="dashboard-search-filter" onClick={this.handleFilterDrop} aria-expanded={filterDropShow} aria-haspopup="true">
                            <FilterIcon className="dashboard-search-filter-icon" />
                            <span>{t('dashNew.filter')}</span>
                        </button>

                        {filterDropShow && (
                            <div className="dashboard-search-filter-dropdown" ref={this.dropdownRef}>
                                <div className="dashboard-search-filter-dropdown-item">
                                    <input type="checkbox" id="resume" name="resume" checked={resume} onChange={this.handleCheckBox} aria-label="Filter by resume" />
                                    <label htmlFor="resume">{t('dashNew.resume')}</label>
                                </div>
                                <div className="dashboard-search-filter-dropdown-item">
                                    <input type="checkbox" id="coverLetter" name="coverLetter" checked={coverLetter} onChange={this.handleCheckBox} aria-label="Filter by cover letter" />
                                    <label htmlFor="coverLetter">{t('dashNew.coverLetter')}</label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="dashboard-search-filter-items">
                    {resume && (
                        <div className="dashboard-search-filter-item" role="status">
                            {t('dashNew.resume')}
                        </div>
                    )}
                    {coverLetter && (
                        <div className="dashboard-search-filter-item" role="status">
                            {t('dashNew.coverLetter')}
                        </div>
                    )}
                    {(resume || coverLetter) && (
                        <button className="dashboard-search-filter-clearAll" onClick={this.clearAllFilters} aria-label="Clear all filters">
                            {t('dashNew.clearAll')}
                        </button>
                    )}
                </div>
            </>
        );
    }
}

export default withTranslation('common')(DashboardSearch);
