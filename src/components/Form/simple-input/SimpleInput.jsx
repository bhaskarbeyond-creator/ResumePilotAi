import React, { Component } from "react";
class SimpleInput extends Component {
  constructor(props) {
    super(props);
    this.state = {
      suggestionValue: "",
    };
    this.handleInputChange = this.handleInputChange.bind(this);
  }
  handleInputChange(e) {
    this.props.handleInputs(this.props.name, e.target.value);
  }

  // Catch browser autofill which fires animationstart on :-webkit-autofill
  handleAutoFill(e) {
    if (e.animationName === 'onAutoFillStart') {
      // Value will be available on next tick after browser fills it
      setTimeout(() => {
        if (this.inputRef && this.inputRef.value) {
          this.props.handleInputs(this.props.name, this.inputRef.value);
        }
      }, 50);
    }
  }

  render() {
    const isPassword = this.props.type === 'Password';
    const inputType = isPassword ? 'password' : (this.props.type || 'text');

    // Map name → proper autocomplete token so browsers can save/fill credentials
    const autoCompleteMap = {
      'Email': 'email',
      'Password': 'current-password',
      'Repeat Password': 'new-password',
      'Name': 'name',
      'First Name': 'given-name',
      'Last Name': 'family-name',
    };
    const autoComplete = this.props.autoComplete ||
      autoCompleteMap[this.props.name] ||
      (isPassword ? 'current-password' : 'off');

    const inputId = this.props.id || `input-${(this.props.name || '').toLowerCase().replace(/\s+/g, '-')}`;

    const inputProps = {
      id: inputId,
      name: inputId,
      type: inputType,
      autoComplete,
      className: "w-full font-sans bg-[#f8fafc] text-[#0f172a] outline-none border border-[#cbd5e1] rounded-xl px-3.5 h-[44px] text-[14px] font-medium transition-all duration-200 ease-in-out focus:outline-none focus:border-[#6366f1] focus:bg-white focus:ring-4 focus:ring-[#6366f1]/15 hover:border-[#94a3b8] placeholder:text-[#94a3b8]",
      style: { backgroundColor: this.props.bg ? this.props.bg : '' },
      disabled: !!this.props.disabled,
      placeholder: this.props.placeholder || '',
      onChange: this.handleInputChange,
      onAnimationStart: this.handleAutoFill.bind(this),
      ref: (el) => { this.inputRef = el; },
    };

    if (this.props.value !== undefined) {
      inputProps.value = this.props.value;
    }

    return (
      <div
        className={
          this.props.checkout == true
            ? "flex flex-col checkout w-full"
            : "flex flex-col w-full mb-3"
        }
      >
        <span className="mb-1.5 text-[#334155] text-[13px] font-bold tracking-wide">
          {this.props.title}
        </span>
        <input {...inputProps} />
      </div>
    );
  }
}

export default SimpleInput;
