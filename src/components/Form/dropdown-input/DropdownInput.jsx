import React, { Component } from "react";
import { FaChevronDown, FaChevronUp, FaSearch, FaCheck } from "react-icons/fa";
import "./DropdownInput.scss";

class DropdownInput extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isShowed: false,
      value: this.props.value ? this.props.value : "",
      searchQuery: "",
    };
    this.containerRef = React.createRef();
    this.togglerHandler = this.togglerHandler.bind(this);
    this.handleClickOutside = this.handleClickOutside.bind(this);
  }

  componentDidMount() {
    document.addEventListener("mousedown", this.handleClickOutside);
  }

  componentWillUnmount() {
    document.removeEventListener("mousedown", this.handleClickOutside);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.value !== this.props.value) {
      this.setState({ value: this.props.value || "" });
    }
  }

  handleClickOutside(event) {
    if (this.containerRef.current && !this.containerRef.current.contains(event.target)) {
      this.setState({ isShowed: false, searchQuery: "" });
    }
  }

  togglerHandler() {
    this.setState((prevState) => ({
      isShowed: !prevState.isShowed,
      searchQuery: "",
    }));
  }

  optionHandler(val) {
    this.setState({
      value: val,
      isShowed: false,
      searchQuery: "",
    });
    if (this.props.handleInputs) {
      this.props.handleInputs(this.props.name || this.props.title, val);
    }
  }

  render() {
    const { options = [], title, placeholder, checkout } = this.props;
    const { isShowed, value, searchQuery } = this.state;

    const filteredOptions = searchQuery.trim()
      ? options.filter((opt) =>
          opt.toString().toLowerCase().includes(searchQuery.toLowerCase().trim())
        )
      : options;

    return (
      <div
        ref={this.containerRef}
        className={`dropdownInput relative ${checkout ? "checkout" : ""}`}
      >
        {title && <span className="dropdownInputTitle">{title}</span>}

        <div
          onClick={this.togglerHandler}
          className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer select-none text-xs font-semibold ${
            isShowed
              ? "border-indigo-600 ring-2 ring-indigo-500/20 bg-white"
              : "border-slate-300 bg-slate-50 hover:border-slate-400"
          }`}
        >
          <span className={`truncate ${value ? "text-slate-900 font-bold" : "text-slate-400"}`}>
            {value || placeholder || "Select option..."}
          </span>
          <div className="text-slate-400 ml-2 shrink-0">
            {isShowed ? <FaChevronUp className="w-3 h-3 text-indigo-600" /> : <FaChevronDown className="w-3 h-3" />}
          </div>
        </div>

        {isShowed && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-fadeIn">
            {options.length > 5 && (
              <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
                <div className="relative flex items-center">
                  <FaSearch className="w-3 h-3 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => this.setState({ searchQuery: e.target.value })}
                    placeholder="Search options..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
              {filteredOptions.length === 0 ? (
                <div className="p-4 text-center text-xs font-medium text-slate-400">
                  No matching options found
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = valToString(opt) === valToString(value);
                  return (
                    <div
                      key={idx}
                      onClick={() => this.optionHandler(opt)}
                      className={`px-3.5 py-2.5 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "bg-indigo-50 text-indigo-700 font-bold"
                          : "text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                      }`}
                    >
                      <span className="truncate">{opt}</span>
                      {isSelected && <FaCheck className="w-3 h-3 text-indigo-600 shrink-0 ml-2" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}

function valToString(v) {
  return v !== null && v !== undefined ? v.toString() : "";
}

export default DropdownInput;
