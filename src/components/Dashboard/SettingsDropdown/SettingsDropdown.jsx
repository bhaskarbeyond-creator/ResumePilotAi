


import React from 'react';
import './SettingsDropdown.scss';
function SettingsDropdown(props) {
    // styles 
 


  return (
    <div className="settings-dropdown">
        <select name={props.name} id="country">
            <option value="Profile">Profile</option>
            <option value="Account">Account</option>
            <option value="Privacy">Privacy</option>
        </select>
     </div>

  )
}

export default SettingsDropdown
