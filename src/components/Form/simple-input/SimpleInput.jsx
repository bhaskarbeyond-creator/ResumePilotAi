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
            ? "flex flex-col checkout"
            : "flex flex-col"
        }
      >
        <span className="my-[5px] text-[#98a1b3] text-[0.9em]">
          {this.props.title}
        </span>
        <input
          type={this.props.type == "Password" ? "password" : ""}
          className="font-sans bg-[#f9f6fe] outline-none border border-transparent  rounded-[3px] px-[10px] py-5 h-[28px] text-[14px] transition-all duration-200 ease-in-out focus:outline-none focus:border focus:border-[#4a6cf7] focus:bg-[#f9f6fe] hover:bg-[#f1f0f3c6]"
          style={{ backgroundColor: this.props.bg ? this.props.bg : "" }}
          disabled={this.props.disabled ? true : false}
          value={this.props.value}
          placeholder={this.props.placeholder ? this.props.placeholder : ""}
          onInputCapture={this.handleInputChange}
          onChange={this.handleInputChange}
        />
      </div>
    );
  }
}

export default SimpleInput;
