import React, { useState } from 'react';
import './AutoComplete.scss';

const Autocomplete = ({ options, onChange }) => {
  const [value, setValue] = useState('');
  const [filteredOptions, setFilteredOptions] = useState([]);



  const handleOptionClick = option => {
    setValue(option);
    setFilteredOptions([]);
    onChange(option);
  };

  return (
    <div className="autocomplete">
      {filteredOptions.length > 0 && (
        <ul>
          {options.map(option => (
            <li key={option} onClick={() => handleOptionClick(option)}>
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Autocomplete;



