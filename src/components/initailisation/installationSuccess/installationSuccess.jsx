import React ,{Component} from 'react';
import './installationSuccess.scss'
import successAnimation from '../../../assets/animations/lottie-success.json'
import { useLottie } from "lottie-react";

const View = () => {
    const successOptions = {
        loop: false,
        autoplay: true,
        animationData: successAnimation,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice'
        }
    };
    const { View } = useLottie(successOptions);
    return View;
  };

class InstallationSuccess extends Component{
    render(){
  

        return(
            <div className="instalationSuccess">
               
                {/* <Lottie  options={successOptions} height={200} width={200} /> */}
                <div className='iconWrapper'><View /></div>
               
               `` <span className="successMessage">Almost there, Lets setup your admin account</span>
                <a onClick={()=>this.props.nextStep()} className="btn-default"> Setup</a>
            </div>
        )
    }
}
export default InstallationSuccess