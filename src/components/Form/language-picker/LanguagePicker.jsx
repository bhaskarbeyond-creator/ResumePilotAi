import React, { Component } from "react";
import "./LanguagePicker.scss";
import UsFlag from "../../../assets/countries/united-states.png";
import DenmarkFlag from "../../../assets/countries/denmark.png";
import SwedenFlag from "../../../assets/countries/sweden.png";
import SpainkFlag from "../../../assets/countries/spain.png";
import RussianFlag from "../../../assets/countries/russia.png";
import FranceFlag from "../../../assets/countries/france.png";
import PortugalFlag from "../../../assets/countries/portugal.png";
import GermanyFlag from "../../../assets/countries/germany.png";
import ItalyFlag from "../../../assets/countries/italy.png";
import GreeceFlag from "../../../assets/countries/greece.png";
import IcelandFlag from "../../../assets/countries/iceland.png";
import NorwayFlag from "../../../assets/countries/norway.png";
import PolandFlag from "../../../assets/countries/poland.png";
import RomaniaFlag from "../../../assets/countries/romania.png";
import NetherlandFlag from "../../../assets/countries/netherlands.png";
import IndiaFlag from "../../../assets/countries/india.png";
import { getWebsiteData } from "../../../services/api/platform";

class LanguagePicker extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: "false",
      language: "en",
      disabledLanguages: [],
    };
    this.handleClick = this.handleClick.bind(this);
    this.closePicker = this.closePicker.bind(this);
  }

  componentDidMount() {
    getWebsiteData().then((data) => {
      if (data && Array.isArray(data.disabledLanguages)) {
        this.setState({ disabledLanguages: data.disabledLanguages });
      }
    });

    this.handleMetaUpdate = (e) => {
      if (e.detail && Array.isArray(e.detail.disabledLanguages)) {
        this.setState({ disabledLanguages: e.detail.disabledLanguages });
      }
    };
    window.addEventListener("websiteMetadataUpdated", this.handleMetaUpdate);
  }

  componentWillUnmount() {
    if (this.handleMetaUpdate) {
      window.removeEventListener("websiteMetadataUpdated", this.handleMetaUpdate);
    }
  }

  handleClick() {
    this.state.isOpen === "true"
      ? this.setState({ isOpen: "false" })
      : this.setState({ isOpen: "true" });
  }

  closePicker() {
    this.setState({
      isOpen: "false",
    });
  }

  isLangDisabled(code, name) {
    const disabledList = this.state.disabledLanguages || [];
    if (!disabledList.length) return false;
    const normCode = (code || "").toLowerCase().trim();
    const normName = (name || "").toLowerCase().trim();
    const isoToNameMap = {
      en: "english",
      hi: "hindi",
      es: "spanish",
      fr: "french",
      de: "german",
      it: "italian",
      pt: "portuguese",
      ru: "russian",
      nl: "dutch",
      pl: "polish",
      se: "swedish",
      no: "norwegian",
      dk: "danish",
      is: "icelandic",
      gk: "greek",
      ro: "romanian",
    };

    return disabledList.some((item) => {
      const normItem = String(item).toLowerCase().trim();
      if (normItem === normCode || normItem === normName) return true;
      if (isoToNameMap[normCode] && normItem === isoToNameMap[normCode]) return true;
      return false;
    });
  }

  render() {
    const ALL_ITEMS = [
      { code: "en", name: "English", flag: UsFlag, alt: "english" },
      { code: "hi", name: "Hindi", flag: IndiaFlag, alt: "hindi" },
      { code: "dk", name: "Danish", flag: DenmarkFlag, alt: "danish" },
      { code: "se", name: "Swedish", flag: SwedenFlag, alt: "swedish" },
      { code: "es", name: "Spanish", flag: SpainkFlag, alt: "spanish" },
      { code: "ru", name: "Russian", flag: RussianFlag, alt: "russian" },
      { code: "fr", name: "French", flag: FranceFlag, alt: "french" },
      { code: "pt", name: "Portuguese", flag: PortugalFlag, alt: "portuguese" },
      { code: "de", name: "German", flag: GermanyFlag, alt: "german" },
      { code: "it", name: "Italian", flag: ItalyFlag, alt: "italian" },
      { code: "gk", name: "Greek", flag: GreeceFlag, alt: "greek" },
      { code: "is", name: "Icelandic", flag: IcelandFlag, alt: "icelandic" },
      { code: "no", name: "Norwegian", flag: NorwayFlag, alt: "norwegian" },
      { code: "pl", name: "Polish", flag: PolandFlag, alt: "polish" },
      { code: "ro", name: "Romanian", flag: RomaniaFlag, alt: "romanian" },
      { code: "nl", name: "Dutch", flag: NetherlandFlag, alt: "dutch" },
    ];

    const visibleItems = ALL_ITEMS.filter(
      (item) => !this.isLangDisabled(item.code, item.name)
    );

    return (
      <div
        style={this.props.isHome ? { transform: "translateX(20px)" } : null}
        className="languagePickerWrapper"
      >
        {/* Current Language */}
        <div className="languagePicker">
          <img
            src={
              this.props.values.language === "en"
                ? UsFlag
                : this.props.values.language === "hi"
                ? IndiaFlag
                : this.props.values.language === "es"
                ? SpainkFlag
                : this.props.values.language === "fr"
                ? FranceFlag
                : this.props.values.language === "ru"
                ? RussianFlag
                : this.props.values.language === "dk"
                ? DenmarkFlag
                : this.props.values.language === "se"
                ? SwedenFlag
                : this.props.values.language === "de"
                ? GermanyFlag
                : this.props.values.language === "pt"
                ? PortugalFlag
                : this.props.values.language === "it"
                ? ItalyFlag
                : this.props.values.language === "gk"
                ? GreeceFlag
                : this.props.values.language === "is"
                ? IcelandFlag
                : this.props.values.language === "no"
                ? NorwayFlag
                : this.props.values.language === "pl"
                ? PolandFlag
                : this.props.values.language === "ro"
                ? RomaniaFlag
                : this.props.values.language === "nl"
                ? NetherlandFlag
                : UsFlag
            }
            alt="us"
          />
          <span onClick={this.handleClick} className="language">
            {this.props.values.language === "en"
              ? "English"
              : this.props.values.language === "hi"
              ? "Hindi"
              : this.props.values.language === "es"
              ? "Spanish"
              : this.props.values.language === "fr"
              ? "French"
              : this.props.values.language === "ru"
              ? "Russian"
              : this.props.values.language === "dk"
              ? "Denmark"
              : this.props.values.language === "se"
              ? "Swedish"
              : this.props.values.language === "de"
              ? "German"
              : this.props.values.language === "pt"
              ? "Portuguese"
              : this.props.values.language === "it"
              ? "Italian"
              : this.props.values.language === "gk"
              ? "Greek"
              : this.props.values.language === "is"
              ? "Icelandic"
              : this.props.values.language === "no"
              ? "Norwegian"
              : this.props.values.language === "pl"
              ? "Polish"
              : this.props.values.language === "ro"
              ? "Romanian"
              : this.props.values.language === "nl"
              ? "Dutch"
              : "English"}
          </span>
        </div>
        {/* Language Dropdown */}
        <div
          className={
            this.state.isOpen === "true"
              ? "languageDropdown"
              : "languageDropDown hidden"
          }
        >
          <ul>
            {visibleItems.map((item) => (
              <li
                key={item.code}
                onClick={() => {
                  this.props.handleLanguageClick(item.code);
                  this.closePicker();
                }}
                className="languagePicker"
              >
                <img src={item.flag} alt={item.alt} />
                <span className="language">{item.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
}
export default LanguagePicker;
