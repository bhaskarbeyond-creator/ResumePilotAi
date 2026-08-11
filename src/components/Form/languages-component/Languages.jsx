import React, { Component } from 'react';
import './Languages.scss';
import Arrow from '../../../assets/arrow.png';
import SimpleInput from '../simple-input/SimpleInput';
import DropdownInput from '../dropdown-input/DropdownInput';
import { withTranslation } from 'react-i18next';
import DeleteImage from '../../../assets/cross.png';

class Languages extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isOpened: 'false',
            title: this.props.title, /// this is the title of the component . we will change it based on input change from ( SimpleInput )
            level: '',
        };
        this.toggleHandle = this.toggleHandle.bind(this);
        this.handleInputs = this.handleInputs.bind(this);
    }
    componentDidMount() {
        //this.setState({level:this.props.level})
    }
    // Handling toggle click
    toggleHandle() {
        this.state.isOpened === 'false' ? this.setState({ isOpened: 'true' }) : this.setState({ isOpened: 'false' });
    }
    // Handling toggle click
    handleInputs(input, value) {
        if (input === 'Language') {
            this.setState({ title: value });
            this.props.handleInputs(input, value, this.props.id, 'Languages');
        } else if (input === 'Level') {
            this.setState({ level: value });
            this.props.handleInputs(input, value, this.props.id, 'Languages');
        } else if (input === 'Listening' || input === 'Reading' || input === 'Spoken Interaction' || input === 'Spoken Production' || input === 'Writing') {
            // Handle Cv51 specific CEFR level fields
            this.props.handleInputs(input, value, this.props.id, 'Languages');
        }
    }
render() {
        const { t, currentResumeName } = this.props;
        return (
            <div className="panel">
                <div className="panel-heading">
                    <span className="panel-title"> {this.state.title == '(not-set)' ? this.props.title : this.state.title}</span>
                    <span className="panel-subtitle">{this.props.level} </span>

                    <div className="panel-action">
                        <a
                            onClick={() => {
                                this.props.removeLanguage(this.props.id);
                                this.props.removeLanguageJsx(this.props.id);
                            }}>
                            <img className="delete_Item" src={DeleteImage} alt="delete" />
                        </a>
                        <img alt="more" onClick={this.toggleHandle} className={this.state.isOpened === 'false' ? 'panel-toggler ' : 'panel-toggler panel-toggler-opened'} src={Arrow} />
                    </div>
                </div>
                    <div className={this.state.isOpened === 'false' ? 'panel-body hidden' : 'panel-body'}>
                        <div className="grid-2-col">
                            <SimpleInput
                                handleInputs={this.handleInputs}
                                value={this.state.title}
                                placeholder={this.props.title ? this.props.title : 'Ex: Spanish'}
                                title={t('form.language')}
                                name="Language"
                            />
                            <DropdownInput
                                value={this.props.level}
                                options={[t('Language.elemntary'), t('Language.Intermediate'), t('Language.Advanced'), t('Language.Proficient')]}
                                handleInputs={this.handleInputs}
                                title={t('form.level')}
                                name="Level"
                            />
                        </div>
                        {currentResumeName === 'Cv51' && (
                            <>
                                <div style={{marginTop: '15px'}}>
                                    <h4 style={{margin: '10px 0', fontSize: '14px', fontWeight: 'bold', color: '#333'}}>Understanding</h4>
                                    <div className="grid-2-col">
                                        <DropdownInput
                                            handleInputs={this.handleInputs}
                                            options={['A1', 'A2', 'B1', 'B2', 'C1', 'C2']}
                                            title="Listening"
                                            name="Listening"
                                        />
                                        <DropdownInput
                                            handleInputs={this.handleInputs}
                                            options={['A1', 'A2', 'B1', 'B2', 'C1', 'C2']}
                                            title="Reading"
                                            name="Reading"
                                        />
                                    </div>
                                </div>
                                <div style={{marginTop: '15px'}}>
                                    <h4 style={{margin: '10px 0', fontSize: '14px', fontWeight: 'bold', color: '#333'}}>Speaking</h4>
                                    <div className="grid-2-col">
                                        <DropdownInput
                                            handleInputs={this.handleInputs}
                                            options={['A1', 'A2', 'B1', 'B2', 'C1', 'C2']}
                                            title="Spoken Interaction"
                                            name="Spoken Interaction"
                                        />
                                        <DropdownInput
                                            handleInputs={this.handleInputs}
                                            options={['A1', 'A2', 'B1', 'B2', 'C1', 'C2']}
                                            title="Spoken Production"
                                            name="Spoken Production"
                                        />
                                    </div>
                                </div>
                                <div style={{marginTop: '15px'}}>
                                    <h4 style={{margin: '10px 0', fontSize: '14px', fontWeight: 'bold', color: '#333'}}>Writing</h4>
                                    <DropdownInput
                                        handleInputs={this.handleInputs}
                                        options={['A1', 'A2', 'B1', 'B2', 'C1', 'C2']}
                                        title="Writing"
                                        name="Writing"
                                    />
                                </div>
                            </>
                        )}
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Languages);
export default MyComponent;
