import { Runtime } from "foldkit";

import { Model, initialModel } from "./model.ts";
import { update } from "./update.ts";
import { view } from "./view.ts";

const application = Runtime.makeElement({
  Model,
  init: () => ({ model: initialModel }),
  update,
  view,
  container: document.getElementById("root"),
});

Runtime.run(application);
