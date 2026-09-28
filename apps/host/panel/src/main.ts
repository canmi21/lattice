import { mount } from 'svelte';
import Panel from './panel.svelte';
import './panel.css';

const target = document.getElementById('panel');
if (target) mount(Panel, { target });
