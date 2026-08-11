import React, { Component } from 'react';
import './ProgressBar.scss';
import { withTranslation } from 'react-i18next';

class ProgressBar extends Component {
    constructor(props) {
        super(props);
        this.state = {
            progress: 0,
        };
        this.recalculateProgress = this.recalculateProgress.bind(this);
    }

    componentDidMount() {
        this.recalculateProgress();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.values !== this.props.values || prevProps.progress !== this.props.progress) {
            this.recalculateProgress();
        }
    }

    // Enterprise-level progress calculation with weighted sections (v2.0 - More generous scoring)
    recalculateProgress() {
        // If explicitly told to use external progress, prefer it
        if (this.props.useExternalProgress === true && typeof this.props.progress === 'number') {
            this.setState({ progress: Math.max(0, Math.min(100, Math.round(this.props.progress))) });
            return;
        }

        const v = this.props.values || {};
        const bool = (x) => (x !== undefined && x !== null && String(x).trim() !== '');
        const hasContent = (arr) => Array.isArray(arr) && arr.some(item => 
            item && typeof item === 'object' && Object.values(item).some(val => bool(val))
        );

        let score = 0;
        const debug = []; // For debugging

        // Personal info (35 points) - More generous
        const personalFields = [v.firstname, v.lastname, v.email, v.phone, v.occupation, v.country, v.city, v.address];
        const personalFilled = personalFields.filter(bool).length;
        const personalScore = Math.min(personalFilled / 5, 1) * 45; // Need at least 5/8 fields for full score
        score += personalScore;
        debug.push(`Personal: ${personalFilled}/8 fields = ${personalScore.toFixed(1)} points`);

        // Summary (20 points) - Increased importance
        const summaryScore = bool(v.summary) ? 20 : 0;
        score += summaryScore;
        debug.push(`Summary: ${bool(v.summary) ? 'Yes' : 'No'} = ${summaryScore} points`);

        // Employment (25 points) - More generous
        let empScore = 0;
        if (hasContent(v.employments)) {
            const empCount = v.employments.filter(emp => emp && (
                bool(emp.company) || bool(emp.position) || bool(emp.description)
            )).length;
            empScore = Math.min(empCount / 1, 1) * 25; // Need at least 1 employment for full score
        }
        score += empScore;
        debug.push(`Employment: ${hasContent(v.employments) ? v.employments.length : 0} entries = ${empScore.toFixed(1)} points`);

        // Education (10 points) - Easier to achieve
        let eduScore = 0;
        if (hasContent(v.educations)) {
            const eduCount = v.educations.filter(edu => edu && (
                bool(edu.institution) || bool(edu.degree) || bool(edu.field)
            )).length;
            eduScore = Math.min(eduCount / 1, 1) * 10; // Need at least 1 education for full score
        }
        score += eduScore;
        debug.push(`Education: ${hasContent(v.educations) ? v.educations.length : 0} entries = ${eduScore.toFixed(1)} points`);

        // Skills (10 points) - More generous
        let skillScore = 0;
        if (hasContent(v.skills)) {
            const skillCount = v.skills.filter(skill => skill && bool(skill.name)).length;
            skillScore = Math.min(skillCount / 3, 1) * 10; // Need at least 3 skills for full score
        }
        score += skillScore;
        debug.push(`Skills: ${hasContent(v.skills) ? v.skills.length : 0} entries = ${skillScore.toFixed(1)} points`);

        // Languages (0 points - Optional)
        // Making languages completely optional since many people only speak one language
        let langScore = 0;
        debug.push(`Languages: Optional section = ${langScore} points`);

        const percent = Math.max(0, Math.min(100, Math.round(score)));
        
        // Debug logging (remove in production)
        console.log('Progress calculation:', debug.join(', '), `Total: ${score.toFixed(1)}/100 = ${percent}%`);
        
        this.setState({ progress: percent });
    }

    // Calculate color based on progress (red → orange → green)
    getProgressColor(pct) {
        if (pct <= 50) {
            // Red to Orange (0-50%)
            // From #e74c3c (231, 76, 60) to #f39c12 (243, 156, 18)
            const ratio = pct / 50;
            const r = Math.round(231 + (243 - 231) * ratio);  // 231 → 243
            const g = Math.round(76 + (156 - 76) * ratio);    // 76 → 156 
            const b = Math.round(60 + (18 - 60) * ratio);     // 60 → 18
            return `rgb(${r}, ${g}, ${b})`;
        } else {
            // Orange to Green (50-100%)
            // From #f39c12 (243, 156, 18) to #2ecc71 (46, 204, 113)
            const ratio = (pct - 50) / 50;
            const r = Math.round(243 + (46 - 243) * ratio);   // 243 → 46
            const g = Math.round(156 + (204 - 156) * ratio);  // 156 → 204
            const b = Math.round(18 + (113 - 18) * ratio);    // 18 → 113
            return `rgb(${r}, ${g}, ${b})`;
        }
    }

    render() {
        const { t } = this.props;
        const pct = this.state.progress;
        const barColor = this.getProgressColor(pct);
        const statusText = pct >= 80 ? t('form.progress.excellent', 'Excellent') : pct >= 50 ? t('form.progress.onTrack', 'On track') : t('form.progress.gettingStarted', 'Getting started');

        return (
            <div className="compact-progress-bar">
                {this.props.textHidden === false && (
                    <div className="progress-info">
                        <span className="progress-label">{t('form.resumeProgress', 'Resume progress')}</span>
                        <span className="progress-value">{pct}%</span>
                    </div>
                )}
                
                <div className="progress-track">
                    <div 
                        className="progress-fill"
                        style={{
                            width: `${pct}%`,
                            backgroundColor: barColor
                        }}
                    />
                </div>
                
                {this.props.textHidden === false && (
                    <div className="progress-status">{statusText}</div>
                )}
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(ProgressBar);
export default MyComponent;
