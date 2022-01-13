<?php
$model = json_decode(stream_get_contents(STDIN));

if ($model->_REGISTER_GLOBAL_MODEL) {
  foreach ($model as $key => $value) {
    $$key = $value;
  }
}

function at($a) {
  return '@' . $a;
}

set_include_path($model->_VIEWS_PATH);

include "$model->_TEMPLATE";
?>
