# homework

Free online playground to practice homework.

Of course you can also use it within a class setting or anywhere really. Naming is hard.

The goal of this tool is not to replace personal guidance, teachers or parents. It is a tool
that you should use just as you would use pen and paper. Ideally you can sit with your
child and be there for them as guidance.

## Developers

Homework is available at <https://elementary.training> for free as a static website,
static as in purely client-side. Each exercise page is its own program that is developed
independently.

Please note that we are not going for the most clever or best designed code in this project.
Obviously we do not want to aim for obsecurity either, but the aim is first and foremost to
have exercises that are good enough for our kids to be able to practise.

### Run

```bash
python -m http.server -d site 8080
```

or run it more easily using [just](https://just.systems/):

```bash
just
```

which does the same, but less typing for you.

### Contributing

Please consult [the CONTRIBUTING docs](./CONTRIBUTING.md) and [the Code of Conduct doc](CODE_OF_CONDUCT.md) for more information.

For now this website and its exercises are only in Dutch (NL-BE), but we aim to support other languages somewhere in near future.
No promises though.

While I don't expect any security issues, given it all runs as fairly dum client-only widgets on your own machine,
there is always a possibility in this very overly complex world. As such, should you notice any security issues,
of any severity or kind, you can find more info on what to do with that [in the SECURITY doc](./SECURITY.md).
