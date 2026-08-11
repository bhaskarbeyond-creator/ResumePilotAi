// Central Template Registry with Static Imports to ensure 100% reliable preview rendering across Vite builds
import Cv1 from '../cv-templates/cv1/Cv1';
import Cv2 from '../cv-templates/cv2/Cv2';
import Cv3 from '../cv-templates/cv3/Cv3';
import Cv4 from '../cv-templates/cv4/Cv4';
import Cv5 from '../cv-templates/cv5/Cv5';
import Cv6 from '../cv-templates/cv6/Cv6';
import Cv7 from '../cv-templates/cv7/Cv7';
import Cv8 from '../cv-templates/cv8/Cv8';
import Cv9 from '../cv-templates/cv9/Cv9';
import Cv10 from '../cv-templates/cv10/Cv10';
import Cv11 from '../cv-templates/cv11/Cv11';
import Cv12 from '../cv-templates/cv12/Cv12';
import Cv13 from '../cv-templates/cv13/Cv13';
import Cv14 from '../cv-templates/cv14/Cv14';
import Cv15 from '../cv-templates/cv15/Cv15';
import Cv16 from '../cv-templates/cv16/Cv16';
import Cv17 from '../cv-templates/cv17/Cv17';
import Cv18 from '../cv-templates/cv18/Cv18';
import Cv19 from '../cv-templates/cv19/Cv19';
import Cv20 from '../cv-templates/cv20/Cv20';
import Cv21 from '../cv-templates/cv21/Cv21';
import Cv22 from '../cv-templates/cv22/Cv22';
import Cv23 from '../cv-templates/cv23/Cv23';
import Cv24 from '../cv-templates/cv24/Cv24';
import Cv25 from '../cv-templates/cv25/Cv25';
import Cv26 from '../cv-templates/cv26/Cv26';
import Cv27 from '../cv-templates/cv27/Cv27';
import Cv28 from '../cv-templates/cv28/Cv28';
import Cv29 from '../cv-templates/cv29/Cv29';
import Cv30 from '../cv-templates/cv30/Cv30';
import Cv31 from '../cv-templates/cv31/Cv31';
import Cv32 from '../cv-templates/cv32/Cv32';
import Cv33 from '../cv-templates/cv33/Cv33';
import Cv34 from '../cv-templates/cv34/Cv34';
import Cv35 from '../cv-templates/cv35/Cv35';
import Cv36 from '../cv-templates/cv36/Cv36';
import Cv37 from '../cv-templates/cv37/Cv37';
import Cv38 from '../cv-templates/cv38/Cv38';
import Cv39 from '../cv-templates/cv39/Cv39';
import Cv40 from '../cv-templates/cv40/Cv40';
import Cv41 from '../cv-templates/cv41/Cv41';
import Cv42 from '../cv-templates/cv42/Cv42';
import Cv43 from '../cv-templates/cv43/Cv43';
import Cv44 from '../cv-templates/cv44/Cv44';
import Cv45 from '../cv-templates/cv45/Cv45';
import Cv46 from '../cv-templates/cv46/Cv46';
import Cv47 from '../cv-templates/cv47/Cv47';
import Cv48 from '../cv-templates/cv48/Cv48';
import Cv49 from '../cv-templates/cv49/Cv49';
import Cv50 from '../cv-templates/cv50/Cv50';
import Cv51 from '../cv-templates/cv51/Cv51';

export const templateMap = {
    Cv1, Cv2, Cv3, Cv4, Cv5, Cv6, Cv7, Cv8, Cv9, Cv10,
    Cv11, Cv12, Cv13, Cv14, Cv15, Cv16, Cv17, Cv18, Cv19, Cv20,
    Cv21, Cv22, Cv23, Cv24, Cv25, Cv26, Cv27, Cv28, Cv29, Cv30,
    Cv31, Cv32, Cv33, Cv34, Cv35, Cv36, Cv37, Cv38, Cv39, Cv40,
    Cv41, Cv42, Cv43, Cv44, Cv45, Cv46, Cv47, Cv48, Cv49, Cv50, Cv51
};

export const getTemplateComponent = (templateId) => {
    return templateMap[templateId] || Cv1;
};
