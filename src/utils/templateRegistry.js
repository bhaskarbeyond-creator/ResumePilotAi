import React, { lazy } from 'react';
import Cv1 from '../cv-templates/cv1/Cv1';

// Static import for default Cv1 for 0-latency instant initial load
// Lazy imports for Cv2-Cv51 to prevent bundle saturation and ensure lightning-fast page loads
export const templateMap = {
    Cv1: Cv1,
    Cv2: lazy(() => import('../cv-templates/cv2/Cv2')),
    Cv3: lazy(() => import('../cv-templates/cv3/Cv3')),
    Cv4: lazy(() => import('../cv-templates/cv4/Cv4')),
    Cv5: lazy(() => import('../cv-templates/cv5/Cv5')),
    Cv6: lazy(() => import('../cv-templates/cv6/Cv6')),
    Cv7: lazy(() => import('../cv-templates/cv7/Cv7')),
    Cv8: lazy(() => import('../cv-templates/cv8/Cv8')),
    Cv9: lazy(() => import('../cv-templates/cv9/Cv9')),
    Cv10: lazy(() => import('../cv-templates/cv10/Cv10')),
    Cv11: lazy(() => import('../cv-templates/cv11/Cv11')),
    Cv12: lazy(() => import('../cv-templates/cv12/Cv12')),
    Cv13: lazy(() => import('../cv-templates/cv13/Cv13')),
    Cv14: lazy(() => import('../cv-templates/cv14/Cv14')),
    Cv15: lazy(() => import('../cv-templates/cv15/Cv15')),
    Cv16: lazy(() => import('../cv-templates/cv16/Cv16')),
    Cv17: lazy(() => import('../cv-templates/cv17/Cv17')),
    Cv18: lazy(() => import('../cv-templates/cv18/Cv18')),
    Cv19: lazy(() => import('../cv-templates/cv19/Cv19')),
    Cv20: lazy(() => import('../cv-templates/cv20/Cv20')),
    Cv21: lazy(() => import('../cv-templates/cv21/Cv21')),
    Cv22: lazy(() => import('../cv-templates/cv22/Cv22')),
    Cv23: lazy(() => import('../cv-templates/cv23/Cv23')),
    Cv24: lazy(() => import('../cv-templates/cv24/Cv24')),
    Cv25: lazy(() => import('../cv-templates/cv25/Cv25')),
    Cv26: lazy(() => import('../cv-templates/cv26/Cv26')),
    Cv27: lazy(() => import('../cv-templates/cv27/Cv27')),
    Cv28: lazy(() => import('../cv-templates/cv28/Cv28')),
    Cv29: lazy(() => import('../cv-templates/cv29/Cv29')),
    Cv30: lazy(() => import('../cv-templates/cv30/Cv30')),
    Cv31: lazy(() => import('../cv-templates/cv31/Cv31')),
    Cv32: lazy(() => import('../cv-templates/cv32/Cv32')),
    Cv33: lazy(() => import('../cv-templates/cv33/Cv33')),
    Cv34: lazy(() => import('../cv-templates/cv34/Cv34')),
    Cv35: lazy(() => import('../cv-templates/cv35/Cv35')),
    Cv36: lazy(() => import('../cv-templates/cv36/Cv36')),
    Cv37: lazy(() => import('../cv-templates/cv37/Cv37')),
    Cv38: lazy(() => import('../cv-templates/cv38/Cv38')),
    Cv39: lazy(() => import('../cv-templates/cv39/Cv39')),
    Cv40: lazy(() => import('../cv-templates/cv40/Cv40')),
    Cv41: lazy(() => import('../cv-templates/cv41/Cv41')),
    Cv42: lazy(() => import('../cv-templates/cv42/Cv42')),
    Cv43: lazy(() => import('../cv-templates/cv43/Cv43')),
    Cv44: lazy(() => import('../cv-templates/cv44/Cv44')),
    Cv45: lazy(() => import('../cv-templates/cv45/Cv45')),
    Cv46: lazy(() => import('../cv-templates/cv46/Cv46')),
    Cv47: lazy(() => import('../cv-templates/cv47/Cv47')),
    Cv48: lazy(() => import('../cv-templates/cv48/Cv48')),
    Cv49: lazy(() => import('../cv-templates/cv49/Cv49')),
    Cv50: lazy(() => import('../cv-templates/cv50/Cv50')),
    Cv51: lazy(() => import('../cv-templates/cv51/Cv51'))
};

export const getTemplateComponent = (templateId) => {
    return templateMap[templateId] || Cv1;
};
