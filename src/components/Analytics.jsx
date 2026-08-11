import {getWebsiteData} from '../firestore/dbOperations'
export    function Analytics(page){
        getWebsiteData().then((value)=>{
                if(value !== undefined)
                if(value.trackingCode !== undefined){
                       
                    
                }
        })
  
}
