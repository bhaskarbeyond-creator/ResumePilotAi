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

  render() {
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
        <input
          type={this.props.type == "Password" ? "password" : (this.props.type || "text")}
          className="w-full font-sans bg-[#f8fafc] text-[#0f172a] outline-none border border-[#cbd5e1] rounded-xl px-3.5 h-[44px] text-[14px] font-medium transition-all duration-200 ease-in-out focus:outline-none focus:border-[#6366f1] focus:bg-white focus:ring-4 focus:ring-[#6366f1]/15 hover:border-[#94a3b8] placeholder:text-[#94a3b8]"
          style={{ backgroundColor: this.props.bg ? this.props.bg : "" }}
          disabled={this.props.disabled ? true : false}
          value={this.props.value !== undefined ? this.props.value : ""}
          placeholder={this.props.placeholder ? this.props.placeholder : ""}
          onInputCapture={this.handleInputChange}
          onChange={this.handleInputChange}
        />
      </div>
    );
  }
}

export default SimpleInput;
