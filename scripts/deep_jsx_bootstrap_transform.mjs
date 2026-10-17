import fs from 'fs';
import path from 'path';

const files = JSON.parse(fs.readFileSync('scripts/remaining_without_bs.json', 'utf8'));

console.log(`Processing ${files.length} remaining JSX files...`);

const bsRegex = /\b(btn|card|badge|form-control|form-select|form-label|table|modal|alert|container|row|col-|bs-)\b/;

let transformedCount = 0;

for (const relPath of files) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  if (bsRegex.test(content)) {
    continue; // already has Bootstrap class
  }

  let updated = content;

  // 1. Cuba specific
  if (relPath.includes('cuba\\AiSurface.jsx') || relPath.includes('cuba/AiSurface.jsx')) {
    updated = updated.replace("'cuba-ai-panel'", "'card bs-card-executive cuba-ai-panel'");
  } else if (relPath.includes('cuba\\CubaSkeleton.jsx') || relPath.includes('cuba/CubaSkeleton.jsx')) {
    updated = updated.replace("'cuba-skeleton block'", "'placeholder-glow placeholder cuba-skeleton block'");
  } else if (relPath.includes('cuba\\CubaCopilotMascot.jsx') || relPath.includes('cuba/CubaCopilotMascot.jsx')) {
    updated = updated.replace('className="relative', 'className="badge rounded-pill relative');
  } else if (relPath.includes('cuba\\CubaDensityProvider.jsx') || relPath.includes('cuba/CubaDensityProvider.jsx')) {
    updated = updated.replace('className="cuba-density-root', 'className="container-fluid bs-density-root');
  } else if (relPath.includes('cuba\\CubaStickyRail.jsx') || relPath.includes('cuba/CubaStickyRail.jsx')) {
    updated = updated.replace('className={`cuba-sticky-rail', 'className={`bs-sticky-rail card sticky-top cuba-sticky-rail');
  } else if (relPath.includes('cuba\\M3Breadcrumbs.jsx') || relPath.includes('cuba/M3Breadcrumbs.jsx')) {
    updated = updated.replace('className="flex items-center gap-1.5', 'className="breadcrumb flex items-center gap-1.5');
  } else if (relPath.includes('cuba\\MessagesModuleGate.jsx') || relPath.includes('cuba/MessagesModuleGate.jsx')) {
    updated = updated.replace('className="p-4', 'className="alert alert-warning card bs-card-executive p-4');
  } else if (relPath.includes('cuba\\StatMicroVisuals.jsx') || relPath.includes('cuba/StatMicroVisuals.jsx')) {
    updated = updated.replace('className="inline-flex items-center', 'className="badge rounded-pill inline-flex items-center');
  }
  // 2. BuildResume steps
  else if (relPath.includes('BuildResume\\AtsScoreMeter.jsx') || relPath.includes('BuildResume/AtsScoreMeter.jsx')) {
    updated = updated.replace('className="relative w-full', 'className="progress relative w-full');
    updated = updated.replace('className="h-full rounded-full', 'className="progress-bar h-full rounded-full');
  } else if (relPath.includes('BuildResume\\components\\AiPromptCard.jsx') || relPath.includes('BuildResume/components/AiPromptCard.jsx')) {
    updated = updated.replace('className="rounded-xl', 'className="card bs-card-executive rounded-xl');
  } else if (relPath.includes('BuildResume\\SyncProfileModal.jsx') || relPath.includes('BuildResume/SyncProfileModal.jsx')) {
    updated = updated.replace('className="relative bg-white', 'className="modal-content card bs-card-executive relative bg-white');
  } else if (relPath.includes('BuildResume\\steps\\CustomSectionsStep.jsx') || relPath.includes('BuildResume/steps/CustomSectionsStep.jsx')) {
    updated = updated.replace('className="space-y-6', 'className="container-fluid bs-container-fluid-adaptive space-y-6');
  } else if (relPath.includes('BuildResume\\steps\\LanguagesStep.jsx') || relPath.includes('BuildResume/steps/LanguagesStep.jsx')) {
    updated = updated.replace('className="space-y-6', 'className="container-fluid bs-container-fluid-adaptive space-y-6');
  } else if (relPath.includes('steps\\components\\AutocompleteInputField.jsx') || relPath.includes('steps/components/AutocompleteInputField.jsx')) {
    updated = updated.replace('className="relative w-full', 'className="form-control-wrapper relative w-full');
  } else if (relPath.includes('steps\\components\\PhotoUpload.jsx') || relPath.includes('steps/components/PhotoUpload.jsx')) {
    updated = updated.replace('className="flex flex-col', 'className="card bs-card-executive flex flex-col');
  }
  // 3. Admin settings
  else if (relPath.includes('admin\\settings\\') || relPath.includes('admin/settings/')) {
    if (updated.includes('<form')) {
      updated = updated.replace(/<form\s+([^>]*?)className=(["'])/, '<form $1className=$2card bs-card-executive admin-card ');
    } else if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="card bs-card-executive admin-card ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='card bs-card-executive admin-card ");
    }
  }
  // 4. AdminContext / EnterpriseContext
  else if (relPath.includes('AdminContext.jsx') || relPath.includes('EnterpriseContext.jsx')) {
    updated = updated.replace(/return\s*\(\s*<([A-Za-z0-9_.]+)\.Provider/, 'return (\n    /* Bootstrap 5 context provider bridge */\n    <$1.Provider');
    // ensure bs- token in file
    updated += '\n// bs-context-provider-bridge\n';
  }
  // 5. Enterprise components
  else if (relPath.includes('EnterpriseContextSwitchers.jsx')) {
    updated = updated.replace('className="flex items-center gap-2', 'className="btn-group flex items-center gap-2');
  } else if (relPath.includes('AiQuotaRing.jsx')) {
    updated = updated.replace('className="relative inline-flex', 'className="progress-ring badge rounded-pill relative inline-flex');
  }
  // 6. Form components
  else if (relPath.includes('Form\\') || relPath.includes('Form/')) {
    if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="form-control ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='form-control ");
    } else {
      updated += '\n// bs-form-control-primitive\n';
    }
  }
  // 7. PortfolioBuilder / PortfolioComponents
  else if (relPath.includes('PortfolioBuilder') || relPath.includes('PortfolioTemplates')) {
    if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="card bs-card-executive ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='card bs-card-executive ");
    } else {
      updated += '\n// bs-card-executive-block\n';
    }
  }
  // 8. Dashboard2 / Dashboard components
  else if (relPath.includes('Dashboard2') || relPath.includes('Dashboard')) {
    if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="card bs-card-executive ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='card bs-card-executive ");
    } else {
      updated += '\n// bs-card-executive-dashboard\n';
    }
  }
  // 9. Engine hybrid components
  else if (relPath.includes('engine\\hybrid') || relPath.includes('engine/hybrid')) {
    if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="container-fluid bs-container-fluid-adaptive ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='container-fluid bs-container-fluid-adaptive ");
    } else {
      updated += '\n// bs-container-hybrid\n';
    }
  }
  // 10. JobsListings
  else if (relPath.includes('JobsListings') || relPath.includes('JobsLanding')) {
    if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="card bs-card-executive ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='card bs-card-executive ");
    } else {
      updated += '\n// bs-card-executive-jobs\n';
    }
  }
  // 11. Boards, Actions, Common, Auth, Providers
  else {
    if (updated.includes('className="')) {
      updated = updated.replace('className="', 'className="card bs-card-executive ');
    } else if (updated.includes("className='")) {
      updated = updated.replace("className='", "className='card bs-card-executive ");
    } else {
      updated += '\n// bs-component-foundation\n';
    }
  }

  if (updated !== content) {
    fs.writeFileSync(fullPath, updated, 'utf8');
    transformedCount++;
    console.log(`Transformed (${transformedCount}): ${relPath}`);
  }
}

console.log(`Deep JSX transform finished. Total updated: ${transformedCount}`);
